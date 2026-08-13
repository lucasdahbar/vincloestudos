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
