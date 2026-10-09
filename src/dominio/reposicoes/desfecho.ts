import type { Centavos } from '@/dominio/dinheiro'
import type { OrigemAusencia } from '@/dominio/tipos'
import type { StatusReposicao } from './agendamento'

/**
 * Rodada 3 (regra da gestora, 09/10/2026): o que acontece com a aula que o
 * aluno perdeu quando a reposição não vai acontecer.
 *
 * Vale para os dois caminhos da regra, que terminam na mesma pergunta: a
 * gestora disse logo no aviso que não haveria reposição, ou o aluno desistiu
 * depois, já na lista de reposições. Vale também para a falta sem aviso, que
 * entra na lista do mesmo jeito.
 */

export interface Decisao {
  cobrar: boolean
  /** "Desistência paga": o professor recebe pela aula que não aconteceu. */
  pagarProfessor: boolean
}

export function validarDecisao(d: Decisao): string[] {
  // A regra só pergunta do professor depois de "cobrar = sim".
  return !d.cobrar && d.pagarProfessor
    ? ['O professor só recebe por uma aula que foi cobrada.']
    : []
}

export type StatusCobranca =
  | 'Rascunho'
  | 'Confirmada'
  | 'Enviada'
  | 'Parcial'
  | 'Quitada'
  | 'Cancelada'

/**
 * Não cobrar a aula tem dois efeitos, conforme ela já tenha sido cobrada:
 * ainda não foi, e sai da próxima cobrança; já foi, recebida ou não, e vira
 * crédito do responsável.
 *
 * Cobrança cancelada não conta: cancelar libera as aulas para serem cobradas
 * de novo (C7), então é o mesmo que nunca ter cobrado.
 */
export function creditoDaDesistencia(
  cobrar: boolean,
  itemCobrado: { valor_final: Centavos; cobranca_status: StatusCobranca } | null,
): Centavos {
  if (cobrar || !itemCobrado || itemCobrado.cobranca_status === 'Cancelada') return 0
  return Math.max(0, itemCobrado.valor_final)
}

/**
 * Aviso registrado por engano, ou o aluno acabou vindo.
 *
 * Enquanto nada aconteceu por causa dele — reposição marcada, crédito gerado —
 * o aviso some como se não tivesse existido. Depois disso o acerto é pelo
 * caminho normal: desistência da reposição ou crédito.
 */
export function podeCancelarAviso(p: {
  origem: OrigemAusencia
  status: StatusReposicao
  temCredito: boolean
  /** Ja entrou num fechamento do professor como desistencia paga. */
  pagoAoProfessor?: boolean
}): { pode: true } | { pode: false; motivo: string } {
  if (p.origem !== 'Aviso') {
    return { pode: false, motivo: 'Só um aviso pode ser cancelado. A falta foi marcada pelo professor.' }
  }
  if (p.status === 'Agendada' || p.status === 'Realizada') {
    return { pode: false, motivo: 'A reposição já foi marcada. Registre a desistência dela, em Reposições.' }
  }
  if (p.temCredito) {
    return { pode: false, motivo: 'Este aviso já gerou crédito ao responsável.' }
  }
  if (p.pagoAoProfessor) {
    return { pode: false, motivo: 'Esta aula já entrou no pagamento do professor.' }
  }
  return { pode: true }
}
