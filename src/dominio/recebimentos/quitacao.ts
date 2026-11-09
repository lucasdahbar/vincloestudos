import { somar, type Centavos } from '@/dominio/dinheiro'

export type StatusCobranca = 'Rascunho' | 'Confirmada' | 'Enviada' | 'Quitada' | 'Parcial'

/**
 * Modulos Operacionais 7.2. Se a soma dos recebimentos iguala ou supera o total,
 * a cobranca fica Quitada; se e menor mas maior que zero, fica Parcial. Sem
 * recebimento nenhum, o status atual e preservado (Confirmada ou Enviada).
 */
export function saldoEStatus(
  valorTotal: Centavos,
  recebimentos: Centavos[],
  statusAtual: StatusCobranca,
): { saldo: Centavos; status: StatusCobranca } {
  const recebido = somar(...recebimentos)

  if (recebido <= 0) return { saldo: valorTotal, status: statusAtual }
  if (recebido >= valorTotal) return { saldo: 0, status: 'Quitada' }
  return { saldo: valorTotal - recebido, status: 'Parcial' }
}

export function validarRecebimento(
  valor: Centavos,
  saldoEmAberto: Centavos,
  contaId: number | null,
): string[] {
  const erros: string[] = []

  if (valor <= 0) erros.push('O valor recebido deve ser maior que zero.')
  if (contaId === null) erros.push('Selecione a conta que recebeu o valor.')
  if (saldoEmAberto <= 0) erros.push('Esta cobrança já está quitada.')

  return erros
}

/**
 * Cancelar um recebimento lancado errado (pedido do Julio, 09/11/2026).
 *
 * Com outros recebimentos sobrando, vale a mesma regra da baixa. Sem nenhum,
 * a cobranca nao pode ficar Quitada ou Parcial: volta a Confirmada. O banco nao
 * guarda se ela tinha sido Enviada antes, e as duas se comportam igual em
 * todo o sistema; o rascunho (que pode ter tido um credito abatido) continua
 * rascunho.
 */
export function statusAposCancelarRecebimento(
  valorTotal: Centavos,
  restantes: Centavos[],
  statusAtual: StatusCobranca,
): { saldo: Centavos; status: StatusCobranca } {
  const r = saldoEStatus(valorTotal, restantes, statusAtual)
  if (somar(...restantes) <= 0 && (statusAtual === 'Quitada' || statusAtual === 'Parcial')) {
    return { saldo: valorTotal, status: 'Confirmada' }
  }
  return r
}

/**
 * O motivo e obrigatorio porque o registro e apagado: o log e o unico rastro
 * de que houve o pagamento, e "por que sumiu?" e a primeira pergunta depois.
 */
export function validarCancelamentoRecebimento(
  motivo: string,
  statusCobranca: StatusCobranca | 'Cancelada',
): string[] {
  if (statusCobranca === 'Cancelada') {
    return ['A cobrança está cancelada: o recebimento não pode ser mexido.']
  }
  if (!motivo.trim()) return ['Diga o motivo do cancelamento.']
  return []
}
