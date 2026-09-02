/**
 * C7 e P5 (Rodada 2): cancelar cobranca e cancelar conta a pagar.
 *
 * Cancelar nao e apagar. O registro fica, com status Cancelada, e o que ele
 * tinha reservado volta a ficar livre: as aulas de uma cobranca cancelada podem
 * ser cobradas de novo, e as presencas de uma conta cancelada voltam para o
 * proximo fechamento.
 *
 * O limite dos dois casos e o mesmo: dinheiro que ja andou nao se desfaz por
 * aqui. Cobranca com recebimento e conta com baixa saem do sistema por estorno,
 * conversando com quem pagou — nao por um botao de cancelar.
 */

export type StatusCobranca =
  | 'Rascunho'
  | 'Confirmada'
  | 'Enviada'
  | 'Parcial'
  | 'Quitada'
  | 'Cancelada'

export type StatusContaPagar = 'Pendente' | 'Parcial' | 'Pago' | 'Cancelada'

export type PodeCancelar = { pode: true } | { pode: false; motivo: string }

/**
 * C7: so cobranca Confirmada ou Enviada que ainda nao recebeu nada.
 *
 * Rascunho fica de fora de proposito: nao reservou aula nenhuma ainda, entao o
 * que ela pede e ser descartada, nao cancelada.
 */
export function podeCancelarCobranca(
  status: StatusCobranca,
  quantidadeDeRecebimentos: number,
): PodeCancelar {
  if (quantidadeDeRecebimentos > 0) {
    return {
      pode: false,
      motivo: 'Esta cobrança já tem pagamento registrado e não pode ser cancelada.',
    }
  }

  if (status === 'Cancelada') {
    return { pode: false, motivo: 'Esta cobrança já está cancelada.' }
  }

  if (status === 'Rascunho') {
    return { pode: false, motivo: 'Um rascunho pode ser excluído, sem precisar cancelar.' }
  }

  if (status !== 'Confirmada' && status !== 'Enviada') {
    return { pode: false, motivo: 'Só dá para cancelar uma cobrança confirmada ou enviada.' }
  }

  return { pode: true }
}

/** P5: so conta a pagar Pendente. Parcial ja teve dinheiro saindo. */
export function podeCancelarContaPagar(
  status: StatusContaPagar,
  quantidadeDeBaixas: number,
): PodeCancelar {
  if (quantidadeDeBaixas > 0) {
    return {
      pode: false,
      motivo: 'Esta conta já tem pagamento registrado e não pode ser cancelada.',
    }
  }

  if (status === 'Cancelada') return { pode: false, motivo: 'Esta conta já está cancelada.' }
  if (status !== 'Pendente') {
    return { pode: false, motivo: 'Só dá para cancelar uma conta que ainda está pendente.' }
  }

  return { pode: true }
}
