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
 * Nao cobrar a aula: ainda sem cobranca, ela sai da proxima (a geracao a deixa
 * de fora); cancelada tambem nao conta, porque cancelar libera as aulas (C7).
 *
 * Opcao A do Julio (13/11/2026), depois do caso Isabela: a Kelly manda a
 * cobranca, a familia avisa que nao vem, a aula nao e cobrada — e o sistema
 * gerava credito sobre uma cobranca que ninguem tinha pago. Agora, enquanto
 * nao entrou dinheiro nenhum, a aula sai da cobranca (que e recalculada e,
 * se ja tinha sido enviada, volta a "pronta para enviar"). Credito so quando
 * ja houve recebimento.
 */
export type DestinoDaAula = 'nada' | 'tirar' | 'credito'

export function destinoDaAulaNaoCobrada(
  cobrar: boolean,
  item: { status: StatusCobranca; temRecebimento: boolean } | null,
): DestinoDaAula {
  if (cobrar || !item || item.status === 'Cancelada') return 'nada'
  if (item.temRecebimento || item.status === 'Parcial' || item.status === 'Quitada') return 'credito'
  return 'tirar'
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
  /** A aula de origem foi excluída: o aluno depende da reposição. */
  aulaExcluida?: boolean
}): { pode: true } | { pode: false; motivo: string } {
  if (p.origem === 'Exclusão') {
    return {
      pode: false,
      motivo: 'A aula foi excluída e o aluno transferido para reposição. Registre a desistência dela, em Reposições.',
    }
  }
  if (p.origem !== 'Aviso') {
    return { pode: false, motivo: 'Só um aviso pode ser cancelado. A falta foi marcada pelo professor.' }
  }
  if (p.aulaExcluida) {
    return {
      pode: false,
      motivo: 'A aula deste aviso foi excluída: o aluno precisa da reposição. Registre a desistência se ela não for acontecer.',
    }
  }
  if (p.status === 'Agendada' || p.status === 'Realizada') {
    return { pode: false, motivo: 'A reposição já foi marcada. Registre a desistência dela, em Reposições.' }
  }
  if (p.temCredito) {
    return {
      pode: false,
      motivo: 'O crédito deste aviso já foi abatido ou devolvido ao responsável.',
    }
  }
  if (p.pagoAoProfessor) {
    return { pode: false, motivo: 'Esta aula já entrou no pagamento do professor.' }
  }
  return { pode: true }
}

export type TipoUsoCredito = 'Abatimento' | 'Devolução' | 'Cancelamento'

/**
 * Caso Isabela (12/11/2026): o aviso gerou credito, a gestora cancelou o
 * credito porque a aluna resolveu vir, e mesmo assim o aviso nao podia mais
 * ser cancelado — qualquer credito ligado travava. A aluna ficou presa como
 * "avisou que nao vem" na aula.
 *
 * So trava o credito que mexeu em dinheiro (abatido numa cobranca ou
 * devolvido). O que sobrou intacto e estornado ao cancelar o aviso, e o
 * credito fica como historico, sem saldo.
 */
export function creditoAoCancelarAviso(
  credito: { valor: Centavos; usos: { tipo: TipoUsoCredito; valor: Centavos }[] } | null,
): { usado: boolean; estornar: Centavos } {
  if (!credito) return { usado: false, estornar: 0 }
  const usado = credito.usos.some((u) => u.tipo !== 'Cancelamento')
  const saldo = credito.valor - credito.usos.reduce((t, u) => t + u.valor, 0)
  return { usado, estornar: usado ? 0 : Math.max(0, saldo) }
}
