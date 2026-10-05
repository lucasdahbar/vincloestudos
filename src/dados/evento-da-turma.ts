import 'server-only'
import { clienteAdmin } from './admin'
import {
  apagarEvento,
  atualizarDescricao,
  listarOcorrencias,
  sincronizarEvento,
} from '@/agenda/eventos'
import { ajustarCoorganizador, criarSala } from '@/agenda/meet'
import {
  descricaoDoEvento,
  type MatriculaDoEvento,
  type TurmaDoEvento,
} from '@/dominio/agenda/evento-google'
import { oQueFazerComASala } from '@/dominio/agenda/meet'
import {
  ajustesDasOcorrencias,
  alunosDaSerie,
  alunosNaData,
  fimDoHorizonte,
} from '@/dominio/agenda/ocorrencias'
import { agoraNaEscola } from '@/dominio/agenda/relogio'

const CAMPOS_TURMA =
  'id, nome, tipo_recorrencia, data_unica, dias_semana, horario_inicio, horario_fim, modalidade, status, google_calendar_event_id, link_videochamada, google_meet_sala, professor:professores!professor_id (email, google_calendar_id)'

type TurmaLida = {
  nome: string
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_unica: string | null
  dias_semana: number[] | null
  horario_inicio: string
  horario_fim: string
  modalidade: 'Presencial' | 'Online'
}

/** Hoje no relógio da escola: o servidor roda em UTC, e às 21h já seria amanhã. */
function hojeISO(): string {
  return agoraNaEscola(new Date()).slice(0, 10)
}

async function matriculasDaTurma(turmaId: number): Promise<MatriculaDoEvento[]> {
  const { data } = await clienteAdmin()
    .from('matriculas')
    .select('status, flag_reposicao, data_inicio, data_fim, aluno:alunos!aluno_id (nome)')
    .eq('turma_id', turmaId)
    .eq('status', 'Ativa')
    .eq('flag_reposicao', false)

  return (data ?? []).map((m) => ({
    nome: (m.aluno as unknown as { nome: string } | null)?.nome ?? 'Aluno',
    status: m.status,
    flag_reposicao: m.flag_reposicao,
    data_inicio: String(m.data_inicio).slice(0, 10),
    data_fim: m.data_fim ? String(m.data_fim).slice(0, 10) : null,
  }))
}

/** O evento da turma sem os alunos, que mudam de ocorrência para ocorrência. */
function eventoSemAlunos(
  turma: TurmaLida,
  inicio: string,
  professorEmail: string | null,
  link: string | null,
): Omit<TurmaDoEvento, 'alunos'> {
  return {
    nome: turma.nome,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_unica: turma.data_unica,
    dias_semana: turma.dias_semana ?? [],
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    modalidade: turma.modalidade,
    inicio_recorrencia: inicio,
    professor_email: professorEmail,
    link_videochamada: link,
  }
}

/**
 * Os alunos da descrição geral do evento. Aula única tem uma data só: lá vai
 * quem está matriculado nela. Na recorrente, os fixos — os avulsos entram
 * ocorrência por ocorrência, em `ajustarOcorrencias`.
 */
function alunosDaDescricaoGeral(turma: TurmaLida, matriculas: MatriculaDoEvento[]): string[] {
  return turma.tipo_recorrencia === 'Único'
    ? alunosNaData(matriculas, turma.data_unica ?? hojeISO())
    : alunosDaSerie(matriculas)
}

/**
 * Dá a cada ocorrência futura a lista de alunos daquele dia.
 *
 * Só escreve onde a descrição no Google não bate: quase sempre nada, ou só a
 * ocorrência do aluno avulso. E desfaz sozinho: quando o avulso sai, a
 * ocorrência dele volta a ter a lista da série.
 */
async function ajustarOcorrencias(
  googleCalendarId: string,
  eventoId: string,
  evento: Omit<TurmaDoEvento, 'alunos'>,
  matriculas: MatriculaDoEvento[],
): Promise<{ ok: boolean; motivo?: string }> {
  if (evento.tipo_recorrencia !== 'Recorrente') return { ok: true }

  const hoje = hojeISO()
  const lidas = await listarOcorrencias(
    googleCalendarId,
    eventoId,
    hoje,
    fimDoHorizonte(matriculas, hoje),
  )
  if (!lidas.ok) return lidas

  const ajustes = ajustesDasOcorrencias(lidas.ocorrencias, matriculas, (alunos) =>
    descricaoDoEvento({ ...evento, alunos }),
  )

  // Poucas por vez: o Google limita a taxa de escrita por usuário.
  const falhas: string[] = []
  for (let i = 0; i < ajustes.length; i += 5) {
    const lote = await Promise.all(
      ajustes
        .slice(i, i + 5)
        .map((a) => atualizarDescricao(googleCalendarId, a.id, a.descricao)),
    )
    for (const r of lote) if (!r.ok) falhas.push(r.motivo)
  }

  return falhas.length === 0
    ? { ok: true }
    : { ok: false, motivo: `${falhas.length} ocorrência(s) não atualizada(s): ${falhas[0]}` }
}

/**
 * G2 (Rodada 2): mantém o evento da turma na agenda do professor.
 *
 * Chamado depois de salvar a turma, em `after()`. Nada aqui pode derrubar o
 * salvamento: a turma é o dado do negócio e já está gravada; o evento é
 * reflexo dela. Se o Google estiver fora, a próxima edição refaz.
 */
export async function sincronizarEventoDaTurma(
  turmaId: number,
): Promise<{ ok: boolean; motivo?: string }> {
  if (process.env.GOOGLE_CALENDAR_ATIVO !== 'true') {
    return { ok: false, motivo: 'A integração com o Google Agenda está desligada.' }
  }

  const admin = clienteAdmin()
  const { data: turma } = await admin
    .from('turmas')
    .select(CAMPOS_TURMA)
    .eq('id', turmaId)
    .maybeSingle()

  if (!turma) return { ok: false, motivo: 'Turma não encontrada.' }

  const professor = turma.professor as unknown as
    | { email: string | null; google_calendar_id: string | null }
    | null

  // Turma encerrada some da agenda: deixar o evento seria o professor
  // continuar vendo aula que não vai acontecer.
  if (turma.status !== 'Ativa') {
    if (turma.google_calendar_event_id && professor?.google_calendar_id) {
      const r = await apagarEvento(professor.google_calendar_id, turma.google_calendar_event_id)
      if (r.ok) {
        await admin.from('turmas').update({ google_calendar_event_id: null }).eq('id', turmaId)
      }
      return r
    }
    return { ok: true }
  }

  // G3: a sala do Meet vem antes do evento, para o link já entrar nele.
  const link = await prepararSala(turmaId, turma, professor?.email ?? null)

  // A recorrência começa hoje: criar o evento retroativo encheria a agenda do
  // professor de aulas passadas que ele já deu.
  const evento = eventoSemAlunos(turma, hojeISO(), professor?.email ?? null, link)
  const matriculas = await matriculasDaTurma(turmaId)

  const r = await sincronizarEvento({
    ...evento,
    alunos: alunosDaDescricaoGeral(turma, matriculas),
    google_calendar_id: professor?.google_calendar_id ?? null,
    evento_id: turma.google_calendar_event_id,
  })

  if (!r.ok) return r

  if (r.eventoId !== turma.google_calendar_event_id) {
    await admin.from('turmas').update({ google_calendar_event_id: r.eventoId }).eq('id', turmaId)
  }

  // Mexer na série (o início muda para hoje) pode desfazer o que cada
  // ocorrência tinha de próprio: confere todas de novo.
  if (!professor?.google_calendar_id) return { ok: true }
  return ajustarOcorrencias(professor.google_calendar_id, r.eventoId, evento, matriculas)
}

/**
 * Atualiza a lista de alunos na descrição do evento da turma.
 *
 * Chamado em `after()` quando uma matrícula muda, e também quando o nome de um
 * aluno muda ou ele é excluído (LGPD: o nome não pode ficar no Google). Os
 * alunos vão só na descrição, nunca como convidados: convidado entra direto na
 * sala do Meet, sem passar pela sala de espera.
 */
export async function atualizarAlunosNoEvento(
  turmaId: number,
): Promise<{ ok: boolean; motivo?: string }> {
  if (process.env.GOOGLE_CALENDAR_ATIVO !== 'true') {
    return { ok: false, motivo: 'A integração com o Google Agenda está desligada.' }
  }

  const { data: turma } = await clienteAdmin()
    .from('turmas')
    .select(CAMPOS_TURMA)
    .eq('id', turmaId)
    .maybeSingle()

  if (!turma) return { ok: false, motivo: 'Turma não encontrada.' }
  // Turma encerrada não tem evento para atualizar.
  if (turma.status !== 'Ativa') return { ok: true }

  const professor = turma.professor as unknown as
    | { email: string | null; google_calendar_id: string | null }
    | null

  // Sem evento ainda (o Google estava fora quando a turma foi salva): criar
  // agora é o mesmo que salvar a turma de novo.
  if (!turma.google_calendar_event_id || !professor?.google_calendar_id) {
    return sincronizarEventoDaTurma(turmaId)
  }

  const evento = eventoSemAlunos(turma, hojeISO(), professor.email, turma.link_videochamada)
  const matriculas = await matriculasDaTurma(turmaId)

  // Primeiro a série, depois as ocorrências: as que não têm descrição própria
  // herdam a da série, e é com ela já nova que a comparação tem de ser feita.
  const r = await atualizarDescricao(
    professor.google_calendar_id,
    turma.google_calendar_event_id,
    descricaoDoEvento({ ...evento, alunos: alunosDaDescricaoGeral(turma, matriculas) }),
  )
  if (!r.ok && r.naoExiste) return sincronizarEventoDaTurma(turmaId)
  if (!r.ok) return r

  return ajustarOcorrencias(
    professor.google_calendar_id,
    turma.google_calendar_event_id,
    evento,
    matriculas,
  )
}

/** As turmas em que o aluno aparece no evento, para quando o próprio aluno muda. */
export async function turmasDoAluno(alunoId: number): Promise<number[]> {
  const { data } = await clienteAdmin()
    .from('matriculas')
    .select('turma_id')
    .eq('aluno_id', alunoId)
    .eq('status', 'Ativa')
    .eq('flag_reposicao', false)

  return [...new Set((data ?? []).map((m) => m.turma_id as number))]
}

/** Atualiza várias turmas sem deixar a falha de uma derrubar as outras. */
export async function atualizarAlunosNosEventos(turmaIds: number[]): Promise<void> {
  if (process.env.GOOGLE_CALENDAR_ATIVO !== 'true' || turmaIds.length === 0) return

  const resultados = await Promise.allSettled(turmaIds.map(atualizarAlunosNoEvento))
  resultados.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`alunos da turma ${turmaIds[i]} nao atualizados no Google:`, r.reason)
    } else if (!r.value.ok) {
      console.warn(`alunos da turma ${turmaIds[i]} nao atualizados no Google:`, r.value.motivo)
    }
  })
}

/**
 * Retira o evento da agenda antes de a turma ser excluida.
 *
 * Precisa ser chamado ANTES do delete: depois dele nao ha mais de onde ler
 * qual evento apagar, e ele ficaria orfao na agenda do professor — uma aula
 * recorrente que ninguem consegue tirar pelo sistema.
 */
export async function apagarEventoDaTurma(
  turmaId: number,
): Promise<{ ok: boolean; motivo?: string }> {
  if (process.env.GOOGLE_CALENDAR_ATIVO !== 'true') return { ok: true }

  const admin = clienteAdmin()
  const { data: turma } = await admin
    .from('turmas')
    .select('google_calendar_event_id, professor:professores!professor_id (google_calendar_id)')
    .eq('id', turmaId)
    .maybeSingle()

  const professor = turma?.professor as unknown as { google_calendar_id: string | null } | null
  if (!turma?.google_calendar_event_id || !professor?.google_calendar_id) return { ok: true }

  return apagarEvento(professor.google_calendar_id, turma.google_calendar_event_id)
}

/**
 * G3: garante a sala do Meet da turma online, com o professor como
 * coorganizador, e devolve o link que vai no evento.
 *
 * Falhar aqui não impede o evento: ele sai sem link, e a próxima vez que a
 * turma for salva tenta de novo.
 */
async function prepararSala(
  turmaId: number,
  turma: {
    modalidade: 'Presencial' | 'Online'
    status: 'Ativa' | 'Encerrada'
    link_videochamada: string | null
    google_meet_sala: string | null
  },
  emailProfessor: string | null,
): Promise<string | null> {
  const acao = oQueFazerComASala(turma)

  if (acao === 'criar') {
    const r = await criarSala(emailProfessor)
    if (!r.ok) {
      console.warn('sala do Meet nao criada:', r.motivo)
      return turma.link_videochamada
    }
    if (r.motivoCoorganizador) console.warn('coorganizador nao definido:', r.motivoCoorganizador)

    await clienteAdmin()
      .from('turmas')
      .update({ google_meet_sala: r.sala, link_videochamada: r.link })
      .eq('id', turmaId)
    return r.link
  }

  if (acao === 'ajustar' && turma.google_meet_sala) {
    const r = await ajustarCoorganizador(turma.google_meet_sala, emailProfessor)
    if (!r.ok) console.warn('coorganizador nao ajustado:', r.motivo)
  }

  return turma.link_videochamada
}
