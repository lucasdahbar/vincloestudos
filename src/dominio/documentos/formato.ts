/**
 * Mascaras e validacao de documentos brasileiros.
 *
 * As mascaras sao aplicadas DURANTE a digitacao (Requisitos v1.0, Secao 9), e
 * nao so na validacao do envio: o campo tem que mostrar o formato certo
 * enquanto a gestora digita, senao ela nao percebe que errou.
 *
 * Toda funcao aceita entrada ja formatada ou so digitos.
 */

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** 999.999.999-99 */
export function mascaraCpf(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** 99.999.999/9999-99 */
export function mascaraCnpj(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/** (99) 99999-9999 para celular, (99) 9999-9999 para fixo. */
export function mascaraTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11)
  if (d.length <= 2) return d.length === 2 ? `(${d})` : d
  const corpo = d.slice(2)
  if (corpo.length <= 4) return `(${d.slice(0, 2)}) ${corpo}`
  // Ate 10 digitos e fixo (4+4); com 11 e celular (5+4).
  const quebra = d.length <= 10 ? 4 : 5
  return `(${d.slice(0, 2)}) ${corpo.slice(0, quebra)}-${corpo.slice(quebra)}`
}

/** XXXXX-XXX */
export function mascaraCep(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}

/** Digito verificador por modulo 11, usado no CPF e no CNPJ. */
function digitoMod11(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((s, d, i) => s + d * pesos[i], 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 11) return false
  // Sequencias repetidas passam na conta do mod 11, mas nao existem na vida real.
  if (/^(\d)\1{10}$/.test(d)) return false

  const n = d.split('').map(Number)
  const primeiro = digitoMod11(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = digitoMod11(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return primeiro === n[9] && segundo === n[10]
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  const n = d.split('').map(Number)
  const primeiro = digitoMod11(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const segundo = digitoMod11(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return primeiro === n[12] && segundo === n[13]
}

export function cepValido(valor: string): boolean {
  return somenteDigitos(valor).length === 8
}

/** Aplica a mascara certa para o tipo de campo. */
export function aplicarMascara(tipo: string, valor: string): string {
  switch (tipo) {
    case 'cpf':
      return mascaraCpf(valor)
    case 'cnpj':
      return mascaraCnpj(valor)
    case 'telefone':
      return mascaraTelefone(valor)
    case 'cep':
      return mascaraCep(valor)
    default:
      return valor
  }
}
