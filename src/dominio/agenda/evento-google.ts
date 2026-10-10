import type { Frequencia, StatusAula } from '@/dominio/tipos'
import { MARCA } from '@/marca'
import { datasDaRegra, somarDias, textoDaRegra, type RegraRecorrencia } from './recorrencia'

/**
 * G2 (Rodada 2): o evento que o sistema cria na agenda do professor.
 *
 * Só a montagem do corpo mora aqui, separada da chamada HTTP: é a parte que
 * tem regra — recorrência, fuso, quem é convidado — e é a parte que dá para
 * conferir sem depender de credencial do Google.
 */

/** Fuso do negócio. As aulas são no horário de Brasília, não em UTC. */
export const FUSO = 'America/Sao_Paulo'

export interface TurmaDoEvento {
  nome: string
  tipo_recorrencia: 'Recorrente' | 'Único'
  /** ISO (AAAA-MM-DD). Só no modo Único. */
  data_unica: string | null
  /** Rodada 4: a regra da recorrente (nulos na única). */
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[]
  /** Período da recorrência, em ISO. O evento começa na primeira data dele. */
  data_inicio: string | null
  data_fim: string | null
  /** Datas da regra que não têm aula no sistema (ver `exdatesDoEvento`). */
  exdates?: string[]
  /** HH:MM. */
  horario_inicio: string
  horario_fim: string
  modalidade: 'Presencial' | 'Online'
  professor_email: string | null
  /** Link do Meet (G3), quando a turma tem. */
  link_videochamada?: string | null
  /** Nomes dos alunos (ver `ocorrencias.ts`). Vão na descrição, nunca como convidados. */
  alunos: string[]
}

export interface MatriculaDoEvento {
  nome: string
  status: 'Ativa' | 'Encerrada'
  flag_reposicao: boolean
  /** ISO (AAAA-MM-DD). */
  data_inicio: string
  data_fim: string | null
}

export interface EventoGoogle {
  summary: string
  description: string
  location?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  recurrence?: string[]
  attendees?: { email: string }[]
}

/** Índice de `Date.getDay()` para a sigla que a RRULE usa. */
const SIGLA_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const FREQ = { Diária: 'DAILY', Semanal: 'WEEKLY', Mensal: 'MONTHLY' } as const

const semHifen = (iso: string) => iso.split('-').join('')
const ddmmaaaa = (iso: string) => iso.split('-').reverse().join('/')

/** A regra da turma recorrente, ou null se faltar algo para montá-la. */
export function regraDoEvento(turma: TurmaDoEvento): RegraRecorrencia | null {
  if (turma.tipo_recorrencia !== 'Recorrente') return null
  if (!turma.data_inicio || !turma.data_fim) return null
  return {
    frequencia: turma.frequencia ?? 'Semanal',
    intervalo: turma.intervalo ?? 1,
    dias_semana: turma.dias_semana,
    data_inicio: turma.data_inicio,
    data_fim: turma.data_fim,
  }
}

/**
 * A primeira data da regra. O Google usa a data do `start` como âncora da
 * RRULE: se ela cair num dia que não é da recorrência, a primeira ocorrência
 * sai num dia que a turma não tem.
 */
export function primeiraOcorrencia(regra: RegraRecorrencia): string | null {
  return datasDaRegra(regra, regra.data_inicio, regra.data_fim)[0] ?? null
}

/**
 * Fim do último dia em São Paulo, em UTC — o formato que o Google exige no
 * UNTIL quando o evento tem fuso. São Paulo é UTC-3 o ano todo desde 2019.
 */
function untilUTC(dataFim: string): string {
  return `${semHifen(somarDias(dataFim, 1))}T025959Z`
}

function recorrenciaDoEvento(regra: RegraRecorrencia, horario: string, exdates: string[]): string[] {
  const partes = [`FREQ=${FREQ[regra.frequencia]}`]
  if (regra.intervalo > 1) partes.push(`INTERVAL=${regra.intervalo}`)
  if (regra.frequencia === 'Semanal') {
    // WKST=SU: o "a cada 2 semanas" conta a mesma semana que o sistema conta.
    const dias = [...regra.dias_semana].sort((a, b) => a - b).map((d) => SIGLA_RRULE[d])
    partes.push('WKST=SU', `BYDAY=${dias.join(',')}`)
  }
  if (regra.frequencia === 'Mensal') {
    partes.push(`BYMONTHDAY=${Number(regra.data_inicio.slice(8, 10))}`)
  }
  partes.push(`UNTIL=${untilUTC(regra.data_fim)}`)

  const linhas = [`RRULE:${partes.join(';')}`]
  if (exdates.length > 0) {
    const hora = `${horario.split(':').join('')}00`
    const datas = [...exdates].sort().map((d) => `${semHifen(d)}T${hora}`)
    linhas.push(`EXDATE;TZID=${FUSO}:${datas.join(',')}`)
  }
  return linhas
}

/**
 * As datas da regra que viram exceção no Google: as que não têm aula ativa no
 * sistema. Feriado/recesso em que a aula ficou (tinha aluno — spec 4.1) não
 * entra: o Google espelha o sistema, não o calendário.
 */
export function exdatesDoEvento(
  regra: RegraRecorrencia,
  puladas: ReadonlySet<string>,
  aulas: { data: string; status: StatusAula }[],
): string[] {
  const ativas = new Set(aulas.filter((a) => a.status !== 'Excluída').map((a) => a.data))
  const excluidas = new Set(aulas.filter((a) => a.status === 'Excluída').map((a) => a.data))
  return datasDaRegra(regra, regra.data_inicio, regra.data_fim).filter(
    (d) => !ativas.has(d) && (excluidas.has(d) || puladas.has(d)),
  )
}

/**
 * Turma única cuja aula foi excluída: o evento sai da agenda, como o da turma
 * encerrada. Única não tem EXDATE — a data dela é o evento inteiro.
 */
export function unicaSemAula(statusDasAulas: readonly StatusAula[]): boolean {
  return (
    statusDasAulas.includes('Excluída') && statusDasAulas.every((s) => s === 'Excluída')
  )
}

export function montarEvento(turma: TurmaDoEvento): EventoGoogle {
  const unico = turma.tipo_recorrencia === 'Único'
  const regra = regraDoEvento(turma)
  const dia = unico ? turma.data_unica : regra ? primeiraOcorrencia(regra) : null

  if (!dia) {
    throw new Error(
      'Turma sem data: evento único exige data, recorrente exige uma regra com ao menos uma aula.',
    )
  }

  const evento: EventoGoogle = {
    summary: turma.nome,
    description: descricaoDoEvento(turma),
    start: { dateTime: `${dia}T${turma.horario_inicio}:00`, timeZone: FUSO },
    end: { dateTime: `${dia}T${turma.horario_fim}:00`, timeZone: FUSO },
  }

  // No local, o Google Agenda mostra o link clicável logo abaixo do horário.
  if (turma.link_videochamada) evento.location = turma.link_videochamada

  // Rodada 4: com UNTIL. A turma agora tem fim (escolhido ou 31/12), e a
  // renovação de fim de ano estende o evento junto.
  if (regra) evento.recurrence = recorrenciaDoEvento(regra, turma.horario_inicio, turma.exdates ?? [])

  // O professor entra como convidado para a aula aparecer na agenda pessoal
  // dele, além da agenda da empresa.
  if (turma.professor_email) {
    evento.attendees = [{ email: turma.professor_email }]
  }

  return evento
}

/**
 * Exportada à parte porque a matrícula atualiza só a descrição: mandar o
 * evento inteiro a cada matrícula reescreveria a série à toa.
 */
export function descricaoDoEvento(turma: TurmaDoEvento): string {
  const regra = regraDoEvento(turma)
  const quando =
    turma.tipo_recorrencia === 'Único'
      ? 'Aula única'
      : regra
        ? `${textoDaRegra(regra)}, até ${ddmmaaaa(regra.data_fim)}`
        : 'Aula recorrente'

  return [
    `${quando}, das ${turma.horario_inicio} às ${turma.horario_fim}.`,
    `Modalidade: ${turma.modalidade}.`,
    ...(turma.link_videochamada ? [`Link da aula: ${turma.link_videochamada}`] : []),
    '',
    ...(turma.alunos.length > 0
      ? [`Alunos matriculados (${turma.alunos.length}):`, ...turma.alunos.map((a) => `- ${a}`)]
      : ['Nenhum aluno matriculado.']),
    '',
    `Evento criado pelo ${MARCA}. Alterações feitas aqui podem ser`,
    'sobrescritas quando a turma ou uma matrícula for salva no sistema.',
  ].join('\n')
}
