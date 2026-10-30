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

export type StatusContaPagar = 'Rascunho' | 'Pendente' | 'Parcial' | 'Pago' | 'Cancelada'

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
  /** Aulas desta cobranca que ja entraram no pagamento de um professor. */
  aulasPagasAoProfessor = 0,
): PodeCancelar {
  if (quantidadeDeRecebimentos > 0) {
    return {
      pode: false,
      motivo: 'Esta cobrança já tem pagamento registrado e não pode ser cancelada.',
    }
  }

  // O professor recebe pelo valor cobrado (13/10/2026): cancelar e gerar de
  // novo com outro desconto faria o pagamento divergir do que foi cobrado.
  if (aulasPagasAoProfessor > 0) {
    return {
      pode: false,
      motivo:
        'Esta cobrança já serviu de base para o pagamento de um professor e não pode ser cancelada.',
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
  // Etapa 7 (decisao 3): o rascunho nao reservou nada; sai inteiro.
  if (status === 'Rascunho') {
    return { pode: false, motivo: 'Um rascunho pode ser descartado, sem precisar cancelar.' }
  }
  if (status !== 'Pendente') {
    return { pode: false, motivo: 'Só dá para cancelar uma conta que ainda está pendente.' }
  }

  return { pode: true }
}

/**
 * Revisao de 30/10/2026: o aluno que sai com aula ja cobrada ganha credito
 * dela (decisao 11), ligado ao item. Cancelar a cobranca desfaz o que foi
 * cobrado, entao o credito deixa de ter razao: e cancelado junto, e todo
 * credito solta o item (senao o item nao sai). Ja usado (abatido ou
 * devolvido), o dinheiro andou: a cobranca nao se cancela.
 */
export function creditosAoCancelarCobranca(
  creditos: { id: number; aluno_nome: string; usado: number; cancelado: boolean }[],
): { erros: string[]; cancelar: number[]; soltar: number[] } {
  const usados = creditos.filter((c) => c.usado > 0)
  if (usados.length > 0) {
    return {
      erros: usados.map(
        (c) =>
          `O crédito de ${c.aluno_nome} que saiu desta cobrança já foi usado (abatido ou devolvido). Cancele a cobrança só depois de desfazer esse uso.`,
      ),
      cancelar: [],
      soltar: [],
    }
  }
  return {
    erros: [],
    cancelar: creditos.filter((c) => !c.cancelado).map((c) => c.id),
    soltar: creditos.map((c) => c.id),
  }
}
