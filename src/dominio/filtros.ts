/**
 * Filtros das listagens: o estado mora na URL (T2), então tudo chega aqui
 * como texto solto de `searchParams`.
 */

type ValorDaUrl = string | string[] | undefined

/** Número vindo da URL, ou undefined quando o filtro não está aplicado. */
export function comoId(valor: ValorDaUrl): number | undefined {
  const bruto = Array.isArray(valor) ? valor[0] : valor
  if (!bruto) return undefined
  const n = Number(bruto)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export function comoTexto(valor: ValorDaUrl): string | undefined {
  const t = (Array.isArray(valor) ? valor[0] : valor)?.trim()
  return t || undefined
}

/** Valor de uma lista fixa (enum); o que não estiver nela não é filtro. */
export function comoOpcao<T extends string>(valor: ValorDaUrl, opcoes: readonly T[]): T | undefined {
  const t = comoTexto(valor)
  return opcoes.find((o) => o === t)
}

/**
 * Acrescenta ao link os filtros aplicados, e só eles: o resto da URL atual
 * (a data que se está vendo, por exemplo) é justamente o que o link troca.
 */
export function comFiltros(
  href: string,
  atuais: Record<string, ValorDaUrl>,
  campos: readonly string[],
): string {
  const [caminho, busca = ''] = href.split('?')
  const parametros = new URLSearchParams(busca)

  for (const campo of campos) {
    const valor = comoTexto(atuais[campo])
    if (valor) parametros.set(campo, valor)
  }

  const final = parametros.toString()
  return final ? `${caminho}?${final}` : caminho
}
