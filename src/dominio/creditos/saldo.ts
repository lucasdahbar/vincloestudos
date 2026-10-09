import { formatarBRL, type Centavos } from '@/dominio/dinheiro'

/**
 * Rodada 3: credito do responsavel, nascido de uma aula ja cobrada que a
 * gestora decidiu nao cobrar.
 *
 * Decisoes da gestora (09/10/2026): nao tem validade; pode ser abatido de uma
 * cobranca em aberto ou da proxima, ou devolvido em dinheiro; pode ser usado em
 * partes. Aluno que sai com credito recebe o valor de volta.
 */
export function saldoDoCredito(valor: Centavos, usos: Centavos[]): Centavos {
  return valor - usos.reduce((t, u) => t + u, 0)
}

export function validarAbatimento(a: {
  valor: Centavos
  saldoCredito: Centavos
  saldoCobranca: Centavos
}): string[] {
  if (a.valor <= 0) return ['Informe um valor maior que zero.']
  if (a.valor > a.saldoCredito) {
    return [`O crédito só tem ${formatarBRL(a.saldoCredito)} disponíveis.`]
  }
  // O que sobra fica guardado no credito, em vez de virar troco na cobranca.
  if (a.valor > a.saldoCobranca) {
    return [`A cobrança só deve ${formatarBRL(a.saldoCobranca)}.`]
  }
  return []
}

export function validarDevolucao(d: { valor: Centavos; saldoCredito: Centavos }): string[] {
  if (d.valor <= 0) return ['Informe um valor maior que zero.']
  if (d.valor > d.saldoCredito) {
    return [`O crédito só tem ${formatarBRL(d.saldoCredito)} disponíveis.`]
  }
  return []
}
