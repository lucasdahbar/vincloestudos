import type { StatusAula } from '@/dominio/tipos'

/**
 * Rodada 4: quais aulas futuras saem quando a regra da turma ou o calendário
 * (feriado, recesso) muda.
 *
 * Só sai a aula que ninguém tocou: Agendada, de hoje em diante, sem presença,
 * sem aluno na data, sem reposição apontando para ela e sem cobrança. A que
 * tem algum vínculo fica, e o alerta de conflito leva a decisão à gestora.
 */
export interface AulaParaLimpar {
  id: number
  /** ISO. */
  data: string
  /** HH:MM. */
  horario: string
  status: StatusAula
  /** Presença, aluno na data, reposição ou cobrança. */
  vinculada: boolean
}

export function aulasParaApagar(
  aulas: AulaParaLimpar[],
  datasValidas: ReadonlySet<string>,
  horarioDaTurma: string,
  hoje: string,
): number[] {
  return aulas
    .filter((a) => a.status === 'Agendada' && a.data >= hoje && !a.vinculada)
    .filter((a) => !(datasValidas.has(a.data) && a.horario === horarioDaTurma))
    .map((a) => a.id)
}

export interface AulaParaMover extends AulaParaLimpar {
  /** Remarcada a mao: o dia e o horario dela foram escolhidos de proposito. */
  remarcada: boolean
}

/**
 * Mudou so o horario da turma: as aulas futuras que continuam na regra MUDAM de
 * horario, em vez de ficarem para tras enquanto nasce outra (caso da Matematica
 * 9o ano, 26/10/2026: ficaram as das 19h, com alunos, e nasceram as das 18h).
 * Mover mantem o id, entao aluno, aviso, reposicao e cobranca vao junto. Por isso
 * o vinculo nao impede, ao contrario da limpeza.
 */
export function aulasParaMover(
  aulas: AulaParaMover[],
  datasValidas: ReadonlySet<string>,
  horarioAntigo: string,
  horarioNovo: string,
  hoje: string,
): number[] {
  if (horarioAntigo === horarioNovo) return []
  return aulas
    .filter((a) => a.status === 'Agendada' && a.data >= hoje && !a.remarcada)
    .filter((a) => a.horario === horarioAntigo && datasValidas.has(a.data))
    .map((a) => a.id)
}

/** Alguma matrícula ativa cobre a data? */
export function temAlunoNaData(
  data: string,
  matriculas: { data_inicio: string; data_fim: string | null }[],
): boolean {
  return matriculas.some((m) => m.data_inicio <= data && (m.data_fim === null || m.data_fim >= data))
}
