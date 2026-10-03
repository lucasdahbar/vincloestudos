import { nomesDosDias } from '@/dominio/tipos'
import { MARCA } from '@/marca'

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
  dias_semana: number[]
  /** HH:MM. */
  horario_inicio: string
  horario_fim: string
  modalidade: 'Presencial' | 'Online'
  /** Data a partir da qual a recorrência começa a valer, em ISO. */
  inicio_recorrencia: string
  professor_email: string | null
  /** Link do Meet (G3), quando a turma tem. */
  link_videochamada?: string | null
  /** Linhas já prontas de `alunosDoEvento`. Vão na descrição, nunca como convidados. */
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

export function montarEvento(turma: TurmaDoEvento): EventoGoogle {
  const unico = turma.tipo_recorrencia === 'Único'
  const dia = unico ? turma.data_unica : primeiraOcorrencia(turma)

  if (!dia) {
    throw new Error('Turma sem data: evento único exige data, recorrente exige dia da semana.')
  }

  const evento: EventoGoogle = {
    summary: turma.nome,
    description: descricaoDoEvento(turma),
    start: { dateTime: `${dia}T${turma.horario_inicio}:00`, timeZone: FUSO },
    end: { dateTime: `${dia}T${turma.horario_fim}:00`, timeZone: FUSO },
  }

  // No local, o Google Agenda mostra o link clicável logo abaixo do horário.
  if (turma.link_videochamada) evento.location = turma.link_videochamada

  if (!unico) {
    // Sem UNTIL: a turma não tem data de término prevista, e encerrá-la no
    // sistema é que apaga o evento. Um UNTIL chutado faria as aulas sumirem
    // da agenda do professor sem ninguém ter pedido.
    evento.recurrence = [
      `RRULE:FREQ=WEEKLY;BYDAY=${turma.dias_semana
        .slice()
        .sort((a, b) => a - b)
        .map((d) => SIGLA_RRULE[d])
        .join(',')}`,
    ]
  }

  // O professor entra como convidado para a aula aparecer na agenda pessoal
  // dele, além da agenda da empresa.
  if (turma.professor_email) {
    evento.attendees = [{ email: turma.professor_email }]
  }

  return evento
}

/**
 * Exportada à parte porque a matrícula atualiza só a descrição: mandar o
 * evento inteiro moveria o início da recorrência e apagaria as aulas passadas
 * da agenda do professor.
 */
export function descricaoDoEvento(turma: TurmaDoEvento): string {
  const quando =
    turma.tipo_recorrencia === 'Único'
      ? 'Aula única'
      : `${nomesDosDias(turma.dias_semana)}, toda semana`

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

/**
 * Quem aparece na descrição do evento, já com a observação de período.
 *
 * O evento é recorrente: a mesma descrição vale para todas as ocorrências.
 * Por isso a lista é a turma de hoje em diante, e quem ainda vai entrar ou já
 * tem data para sair vem marcado.
 */
export function alunosDoEvento(matriculas: MatriculaDoEvento[], hoje: string): string[] {
  return matriculas
    .filter(
      (m) =>
        m.status === 'Ativa' &&
        // Reposição não tem data de fim: o aluno ficaria na lista para sempre.
        !m.flag_reposicao &&
        (m.data_fim === null || m.data_fim >= hoje),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((m) => {
      const comeca = m.data_inicio > hoje
      if (comeca && m.data_fim) return `${m.nome} (de ${diaMes(m.data_inicio)} a ${diaMes(m.data_fim)})`
      if (comeca) return `${m.nome} (a partir de ${diaMes(m.data_inicio)})`
      if (m.data_fim) return `${m.nome} (até ${diaMes(m.data_fim)})`
      return m.nome
    })
}

function diaMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

/**
 * A primeira data, a partir do início da recorrência, que cai num dos dias da
 * semana da turma.
 *
 * O Google usa a data do `start` como âncora da RRULE: se ela cair num dia que
 * não é da recorrência, a primeira ocorrência sai num dia que a turma não tem.
 */
export function primeiraOcorrencia(turma: TurmaDoEvento): string | null {
  if (turma.dias_semana.length === 0) return null

  const dias = new Set(turma.dias_semana)
  const [ano, mes, dia] = turma.inicio_recorrencia.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1, dia))

  // No máximo uma semana: um dos sete dias tem de servir.
  for (let i = 0; i < 7; i++) {
    if (dias.has(d.getUTCDay())) return d.toISOString().slice(0, 10)
    d.setUTCDate(d.getUTCDate() + 1)
  }

  return null
}
