import { somar, type Centavos } from '@/dominio/dinheiro'
import type { OrigemBaixa } from '@/dominio/tipos'
import type { StatusContaPagar } from '@/dominio/cobrancas/cancelamento'

/**
 * P3 e P4 (Rodada 2): dar baixa numa conta a pagar.
 *
 * Espelha `saldoEStatus` do lado das cobrancas de proposito — a gestora ja
 * conhece aquele comportamento, e pagar um professor em duas vezes nao deveria
 * funcionar diferente de receber de um responsavel em duas vezes.
 *
 * A diferenca esta na origem (P4): parte do que ela paga nao sai da conta da
 * empresa. Um responsavel pode pagar o professor direto, em especie ou no Pix
 * pessoal. Isso continua sendo pagamento da conta e precisa estar registrado —
 * so nao pode ser lancado como saida de uma conta da empresa que nao existiu.
 */

export interface Baixa {
  valor: Centavos
  origem: OrigemBaixa
  conta_id: number | null
  responsavel_id: number | null
}

export function saldoEStatusDaConta(
  valorTotal: Centavos,
  baixas: Centavos[],
  statusAtual: StatusContaPagar,
): { saldo: Centavos; status: StatusContaPagar } {
  const pago = somar(...baixas)

  if (pago <= 0) return { saldo: valorTotal, status: statusAtual }
  if (pago >= valorTotal) return { saldo: 0, status: 'Pago' }
  return { saldo: valorTotal - pago, status: 'Parcial' }
}

/**
 * As mensagens falam com a gestora. "Selecione o responsável que pagou" diz o
 * que fazer; "responsavel_id obrigatório" nao diz nada para quem esta na tela.
 */
export function validarBaixa(baixa: Baixa, saldoEmAberto: Centavos): string[] {
  const erros: string[] = []

  if (baixa.valor <= 0) erros.push('O valor pago deve ser maior que zero.')
  if (saldoEmAberto <= 0) erros.push('Esta conta já está paga.')

  // P4: os dois campos sao mutuamente exclusivos, e a origem decide qual vale.
  if (baixa.origem === 'Conta própria') {
    if (baixa.conta_id === null) erros.push('Selecione a conta de onde saiu o valor.')
    if (baixa.responsavel_id !== null) {
      erros.push('Pagamento pela conta própria não tem responsável.')
    }
  } else if (baixa.origem === 'Pago por responsável') {
    if (baixa.responsavel_id === null) erros.push('Selecione o responsável que pagou.')
    if (baixa.conta_id !== null) {
      erros.push('Pagamento feito pelo responsável não sai de uma conta da empresa.')
    }
  } else {
    if (baixa.conta_id !== null || baixa.responsavel_id !== null) {
      erros.push('A origem "Outro" não tem conta nem responsável.')
    }
  }

  return erros
}
