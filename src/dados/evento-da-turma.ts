import 'server-only'
import { clienteAdmin } from './admin'
import { apagarEvento, atualizarDescricao, sincronizarEvento } from '@/agenda/eventos'
import { ajustarCoorganizador, criarSala } from '@/agenda/meet'
import { alunosDoEvento, descricaoDoEvento } from '@/dominio/agenda/evento-google'
import { oQueFazerComASala } from '@/dominio/agenda/meet'

const CAMPOS_TURMA =
  'id, nome, tipo_recorrencia, data_unica, dias_semana, horario_inicio, horario_fim, modalidade, status, google_calendar_event_id, link_videochamada, google_meet_sala, professor:professores!professor_id (email, google_calendar_id)'

function hojeISO(): string {
  const hoje = new Date()
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
}

/** Os alunos que vão na descrição do evento, já filtrados e marcados. */
async function alunosDaTurma(turmaId: number, hoje: string): Promise<string[]> {
  const { data } = await clienteAdmin()
    .from('matriculas')
    .select('status, flag_reposicao, data_inicio, data_fim, aluno:alunos!aluno_id (nome)')
    .eq('turma_id', turmaId)
    .eq('status', 'Ativa')
    .eq('flag_reposicao', false)

  return alunosDoEvento(
    (data ?? []).map((m) => ({
      nome: (m.aluno as unknown as { nome: string } | null)?.nome ?? 'Aluno',
      status: m.status,
      flag_reposicao: m.flag_reposicao,
      data_inicio: String(m.data_inicio).slice(0, 10),
      data_fim: m.data_fim ? String(m.data_fim).slice(0, 10) : null,
    })),
    hoje,
  )
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
  const inicio = hojeISO()

  const r = await sincronizarEvento({
    nome: turma.nome,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_unica: turma.data_unica,
    dias_semana: turma.dias_semana ?? [],
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    modalidade: turma.modalidade,
    inicio_recorrencia: inicio,
    professor_email: professor?.email ?? null,
    link_videochamada: link,
    alunos: await alunosDaTurma(turmaId, inicio),
    google_calendar_id: professor?.google_calendar_id ?? null,
    evento_id: turma.google_calendar_event_id,
  })

  if (!r.ok) return r

  if (r.eventoId !== turma.google_calendar_event_id) {
    await admin.from('turmas').update({ google_calendar_event_id: r.eventoId }).eq('id', turmaId)
  }

  return { ok: true }
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

  const hoje = hojeISO()
  const descricao = descricaoDoEvento({
    nome: turma.nome,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_unica: turma.data_unica,
    dias_semana: turma.dias_semana ?? [],
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    modalidade: turma.modalidade,
    inicio_recorrencia: hoje,
    professor_email: professor.email,
    link_videochamada: turma.link_videochamada,
    alunos: await alunosDaTurma(turmaId, hoje),
  })

  const r = await atualizarDescricao(
    professor.google_calendar_id,
    turma.google_calendar_event_id,
    descricao,
  )
  if (!r.ok && r.naoExiste) return sincronizarEventoDaTurma(turmaId)
  return r
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
