import type { StatusAula } from '@/dominio/tipos'

/**
 * Caso Alice (16/11/2026): a matricula sumiu depois de tres chamadas com
 * presenca, e as aulas ficaram fora da cobranca sem ninguem perceber. A
 * cobranca so nasce da matricula, entao a chamada (presenca ou falta) de quem
 * nao tem matricula valendo na data e uma aula que nunca vai ser cobrada.
 * A tela de Cobrancas mostra essas chamadas para a gestora acertar a matricula
 * antes de confirmar.
 */
export interface ChamadaDoMes {
  aula_id: number
  aluno_id: number
  turma_id: number
  /** Data de referencia da aula (a da remarcacao conta pela original). */
  dia: string
  status_aula: StatusAula
}

export interface MatriculaDoMes {
  aluno_id: number
  turma_id: number
  data_inicio: string
  data_fim: string | null
  status: string
}

const ACONTECE: readonly StatusAula[] = ['Agendada', 'Realizada']

export function chamadasSemMatricula(chamadas: ChamadaDoMes[], matriculas: MatriculaDoMes[]): ChamadaDoMes[] {
  return chamadas.filter(
    (c) =>
      ACONTECE.includes(c.status_aula) &&
      !matriculas.some(
        (m) =>
          m.aluno_id === c.aluno_id &&
          m.turma_id === c.turma_id &&
          m.data_inicio <= c.dia &&
          (!m.data_fim || m.data_fim >= c.dia) &&
          // Mesmo criterio da geracao (dados/cobrancas.ts, matricula_ativa).
          (m.status === 'Ativa' || m.data_fim !== null),
      ),
  )
}
