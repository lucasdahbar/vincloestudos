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

/** Alguma matrícula ativa cobre a data? */
export function temAlunoNaData(
  data: string,
  matriculas: { data_inicio: string; data_fim: string | null }[],
): boolean {
  return matriculas.some((m) => m.data_inicio <= data && (m.data_fim === null || m.data_fim >= data))
}
