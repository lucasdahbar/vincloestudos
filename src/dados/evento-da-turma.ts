import 'server-only'
import { clienteAdmin } from './admin'
import { calendarioEscolar } from './calendario'
import {
  apagarEvento,
  atualizarDescricao,
  listarOcorrencias,
  sincronizarEvento,
} from '@/agenda/eventos'
import { ajustarCoorganizador, criarSala } from '@/agenda/meet'
import { datasPuladas } from '@/dominio/agenda/datas-puladas'
import {
  descricaoDoEvento,
  exdatesDoEvento,
  regraDoEvento,
  eventoSaiDaAgenda,
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
import type { Frequencia } from '@/dominio/tipos'

const CAMPOS_TURMA =
  'id, nome, tipo_recorrencia, data_unica, frequencia, intervalo, dias_semana, data_inicio, data_fim, horario_inicio, horario_fim, modalidade, status, escola_id, google_calendar_event_id, link_videochamada, google_meet_sala, professor:professores!professor_id (email, google_calendar_id)'

type TurmaLida = {
  nome: string
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_unica: string | null
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[] | null
  data_inicio: string | null
  data_fim: string | null
  horario_inicio: string
  horario_fim: string
  modalidade: 'Presencial' | 'Online'
  escola_id: number | null
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
  // Inclusive as de reposicao (correcao de 13/10/2026): `ocorrencias.ts` as
  // poe so na ocorrencia do dia, marcadas.

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
  professorEmail: string | null,
  link: string | null,
  exdates: string[] = [],
): Omit<TurmaDoEvento, 'alunos'> {
  const dia = (v: string | null) => (v ? String(v).slice(0, 10) : null)
  return {
    nome: turma.nome,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_unica: turma.data_unica,
    frequencia: turma.frequencia,
    intervalo: turma.intervalo,
    dias_semana: turma.dias_semana ?? [],
    data_inicio: dia(turma.data_inicio),
    data_fim: dia(turma.data_fim),
    exdates,
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    modalidade: turma.modalidade,
    professor_email: professorEmail,
    link_videochamada: link,
  }
}

/**
 * Rodada 4: as datas da regra sem aula no sistema — feriado, recesso, aula
 * excluída —, que vão como EXDATE no Google.
 */
async function exdatesDaTurma(turmaId: number, turma: TurmaLida): Promise<string[]> {
  const regra = regraDoEvento({ ...eventoSemAlunos(turma, null, null), alunos: [] })
  if (!regra) return []

  const admin = clienteAdmin()
  const [calendario, { data: aulas }] = await Promise.all([
    calendarioEscolar(admin, regra.data_inicio, regra.data_fim),
    admin
      .from('aulas')
      .select('data_hora_referencia, data_hora_original, status')
      .eq('turma_id', turmaId)
      // Pelo dia da regra: a aula remarcada sai do dia de sempre (13/10/2026).
      .gte('data_hora_referencia', `${regra.data_inicio}T00:00:00`)
      .lte('data_hora_referencia', `${regra.data_fim}T23:59:59`),
  ])

  const puladas = new Set(
    datasPuladas(
      turma.escola_id,
      calendario.feriados,
      calendario.recessos,
      regra.data_inicio,
      regra.data_fim,
    ).keys(),
  )
  return exdatesDoEvento(
    regra,
    puladas,
    (aulas ?? []).map((a) => ({
      data: String(a.data_hora_referencia).slice(0, 10),
      status: a.status,
      remarcada: a.data_hora_original !== null,
    })),
  )
}

/**
 * Remarcar uma aula (13/10/2026): cada aula remarcada da turma recorrente
 * ganha um evento avulso no dia novo, e o dia de sempre vira EXDATE da série
 * (`exdatesDaTurma`). Não se usa a edição de ocorrência do Google porque
 * regravar a série, ao salvar a turma, pode desfazê-la. Desfeita a
 * remarcação, excluída a aula ou fora a série inteira, o avulso sai.
 *
 * Devolve as falhas, sem estourar: o evento é reflexo da aula.
 */
async function sincronizarAvulsos(
  turmaId: number,
  turma: TurmaLida,
  googleCalendarId: string,
  professorEmail: string | null,
  link: string | null,
  matriculas: MatriculaDoEvento[] | null,
  apagarTodos = false,
): Promise<string[]> {
  if (turma.tipo_recorrencia !== 'Recorrente') return []

  const admin = clienteAdmin()
  const { data: aulas, error } = await admin
    .from('aulas')
    .select('id, data_hora_inicio, data_hora_fim, data_hora_original, status, google_evento_avulso_id')
    .eq('turma_id', turmaId)
    .or('data_hora_original.not.is.null,google_evento_avulso_id.not.is.null')
  if (error) return [error.message]
  if (!aulas || aulas.length === 0) return []

  const mats = matriculas ?? (await matriculasDaTurma(turmaId))
  const falhas: string[] = []

  for (const a of aulas) {
    const fica = !apagarTodos && a.data_hora_original !== null && a.status !== 'Excluída'

    if (fica) {
      const inicio = String(a.data_hora_inicio)
      // Aula que já passou e já tem evento: não há o que mudar nele. Sem isto,
      // cada matrícula salva regravaria todas as remarcações da história.
      if (a.google_evento_avulso_id && inicio.slice(0, 10) < hojeISO()) continue
      const original = String(a.data_hora_original).slice(0, 16)
      const r = await sincronizarEvento({
        ...eventoSemAlunos(turma, professorEmail, link),
        tipo_recorrencia: 'Único',
        data_unica: inicio.slice(0, 10),
        frequencia: null,
        intervalo: null,
        dias_semana: [],
        data_inicio: null,
        data_fim: null,
        exdates: [],
        horario_inicio: inicio.slice(11, 16),
        horario_fim: String(a.data_hora_fim).slice(11, 16),
        remarcadaDe: original,
        // Quem estava matriculado no dia de sempre — a turma segue igual.
        alunos: alunosNaData(mats, original.slice(0, 10)),
        google_calendar_id: googleCalendarId,
        evento_id: a.google_evento_avulso_id,
      })
      if (!r.ok) {
        falhas.push(r.motivo)
        continue
      }
      if (r.eventoId !== a.google_evento_avulso_id) {
        await admin.from('aulas').update({ google_evento_avulso_id: r.eventoId }).eq('id', a.id)
      }
    } else if (a.google_evento_avulso_id) {
      const r = await apagarEvento(googleCalendarId, a.google_evento_avulso_id)
      if (!r.ok) {
        falhas.push(r.motivo ?? 'O Google recusou a exclusão.')
        continue
      }
      await admin.from('aulas').update({ google_evento_avulso_id: null }).eq('id', a.id)
    }
  }

  return falhas
}

/**
 * Turma de aula única com a aula remarcada: o evento dela (que é o da turma)
 * vai para o dia e horário novos. A turma continua com a data original — é
 * por ela que vale a lista de alunos.
 */
async function comAulaUnicaRemarcada(
  turmaId: number,
  turma: TurmaLida,
  evento: Omit<TurmaDoEvento, 'alunos'>,
): Promise<Omit<TurmaDoEvento, 'alunos'>> {
  if (turma.tipo_recorrencia !== 'Único') return evento
  const { data } = await clienteAdmin()
    .from('aulas')
    .select('data_hora_inicio, data_hora_fim, data_hora_original')
    .eq('turma_id', turmaId)
    .not('data_hora_original', 'is', null)
    .neq('status', 'Excluída')
    .limit(1)
    .maybeSingle()
  if (!data) return evento
  const inicio = String(data.data_hora_inicio)
  return {
    ...evento,
    data_unica: inicio.slice(0, 10),
    horario_inicio: inicio.slice(11, 16),
    horario_fim: String(data.data_hora_fim).slice(11, 16),
    remarcadaDe: String(data.data_hora_original).slice(0, 16),
  }
}

/** Junta o resultado da série com as falhas dos eventos avulsos. */
function comAvulsos(
  r: { ok: boolean; motivo?: string },
  falhas: string[],
): { ok: boolean; motivo?: string } {
  if (falhas.length === 0) return r
  return {
    ok: false,
    motivo: r.motivo ?? `${falhas.length} aula(s) remarcada(s) não atualizada(s) no Google: ${falhas[0]}`,
  }
}

/** O evento sai da agenda? A regra mora em `eventoSaiDaAgenda`. */
async function eventoSai(
  turmaId: number,
  turma: TurmaLida & { status: 'Ativa' | 'Encerrada' },
): Promise<boolean> {
  if (turma.status === 'Ativa' && turma.tipo_recorrencia === 'Recorrente') return false
  const { data } = await clienteAdmin().from('aulas').select('status').eq('turma_id', turmaId)
  return eventoSaiDaAgenda(
    {
      status: turma.status,
      tipo_recorrencia: turma.tipo_recorrencia,
      data_fim: turma.data_fim ? String(turma.data_fim).slice(0, 10) : null,
    },
    (data ?? []).map((a) => a.status),
    hojeISO(),
  )
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

  // Aula que não vai acontecer não pode ficar na agenda do professor. Desde
  // o encerramento com data (13/10/2026), a recorrente encerrada fica, mas
  // termina na véspera — as aulas passadas continuam lá.
  if (await eventoSai(turmaId, turma)) {
    // Com a série, saem os eventos das aulas remarcadas.
    const falhas = professor?.google_calendar_id
      ? await sincronizarAvulsos(turmaId, turma, professor.google_calendar_id, null, null, [], true)
      : []
    if (turma.google_calendar_event_id && professor?.google_calendar_id) {
      const r = await apagarEvento(professor.google_calendar_id, turma.google_calendar_event_id)
      if (r.ok) {
        await admin.from('turmas').update({ google_calendar_event_id: null }).eq('id', turmaId)
      }
      return comAvulsos(r, falhas)
    }
    return comAvulsos({ ok: true }, falhas)
  }

  // G3: a sala do Meet vem antes do evento, para o link já entrar nele.
  const link = await prepararSala(turmaId, turma, professor?.email ?? null)

  // Rodada 4: o evento começa na data de início da turma, que a gestora
  // escolheu (pode ser no passado), e leva as exceções do calendário.
  const evento = await comAulaUnicaRemarcada(
    turmaId,
    turma,
    eventoSemAlunos(turma, professor?.email ?? null, link, await exdatesDaTurma(turmaId, turma)),
  )
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

  // Mexer na série pode desfazer o que cada ocorrência tinha de próprio:
  // confere todas de novo.
  if (!professor?.google_calendar_id) return { ok: true }
  const ajuste = await ajustarOcorrencias(professor.google_calendar_id, r.eventoId, evento, matriculas)
  const falhas = await sincronizarAvulsos(
    turmaId,
    turma,
    professor.google_calendar_id,
    professor.email,
    link,
    matriculas,
  )
  return comAvulsos(ajuste, falhas)
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

  const evento = await comAulaUnicaRemarcada(
    turmaId,
    turma,
    eventoSemAlunos(turma, professor.email, turma.link_videochamada),
  )
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

  const ajuste = await ajustarOcorrencias(
    professor.google_calendar_id,
    turma.google_calendar_event_id,
    evento,
    matriculas,
  )
  // A aula remarcada tem evento próprio: a lista de alunos dela também muda.
  const falhas = await sincronizarAvulsos(
    turmaId,
    turma,
    professor.google_calendar_id,
    professor.email,
    turma.link_videochamada,
    matriculas,
  )
  return comAvulsos(ajuste, falhas)
}

/** As turmas em que o aluno aparece no evento, para quando o próprio aluno muda. */
export async function turmasDoAluno(alunoId: number): Promise<number[]> {
  const { data } = await clienteAdmin()
    .from('matriculas')
    .select('turma_id')
    .eq('aluno_id', alunoId)
    .eq('status', 'Ativa')

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
  if (!professor?.google_calendar_id) return { ok: true }

  // As aulas remarcadas têm evento próprio (13/10/2026): saem também, antes
  // de as aulas serem apagadas — depois não haveria de onde ler os ids.
  const { data: avulsas } = await admin
    .from('aulas')
    .select('google_evento_avulso_id')
    .eq('turma_id', turmaId)
    .not('google_evento_avulso_id', 'is', null)
  for (const a of avulsas ?? []) {
    await apagarEvento(professor.google_calendar_id, a.google_evento_avulso_id as string)
  }

  if (!turma?.google_calendar_event_id) return { ok: true }
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
