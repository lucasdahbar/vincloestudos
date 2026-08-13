/**
 * Valores monetarios trafegam como inteiros de centavos em todo o sistema.
 * Nenhuma operacao aritmetica usa ponto flutuante: o RNF de precisao
 * monetaria do documento de requisitos depende disso.
 */
export type Centavos = number

/** Converte texto digitado em real brasileiro ("1.234,56") para centavos. */
export function deReal(valor: string | number): Centavos {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error(`Valor monetario invalido: ${valor}`)
    return Math.round(valor * 100)
  }

  const limpo = valor.trim().replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.')
  if (limpo === '' || !/^-?\d+(\.\d+)?$/.test(limpo)) {
    throw new Error(`Valor monetario invalido: ${valor}`)
  }
  return Math.round(Number(limpo) * 100)
}

/** Converte o `numeric` do Postgres, que a driver entrega como texto, para centavos. */
export function deNumeric(valor: string | number | null): Centavos {
  if (valor === null) return 0
  const texto = String(valor)
  if (!/^-?\d+(\.\d+)?$/.test(texto)) {
    throw new Error(`Numeric invalido vindo do banco: ${texto}`)
  }
  return Math.round(Number(texto) * 100)
}

/** Converte centavos para o texto aceito por uma coluna `numeric(12,2)`. */
export function paraNumeric(centavos: Centavos): string {
  const negativo = centavos < 0
  const abs = Math.abs(centavos)
  const inteiros = Math.trunc(abs / 100)
  const resto = abs % 100
  return `${negativo ? '-' : ''}${inteiros}.${String(resto).padStart(2, '0')}`
}

export function somar(...valores: Centavos[]): Centavos {
  return valores.reduce((total, valor) => total + valor, 0)
}

export function subtrair(a: Centavos, b: Centavos): Centavos {
  return a - b
}

/**
 * Aplica um percentual (ex.: 60 para 60%) com arredondamento comercial
 * (meio para cima). Usado no repasse ao professor.
 */
export function aplicarPercentual(centavos: Centavos, percentual: number): Centavos {
  return Math.round((centavos * percentual) / 100)
}

const formatador = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatarBRL(centavos: Centavos): string {
  // O ICU insere um espaco nao-quebravel depois de "R$" -- U+00A0 em versoes
  // antigas, U+202F nas atuais. \s cobre os dois sem depender de escape, e
  // nao ha outro espaco possivel nesta string. Normalizar importa: o texto
  // vai para o WhatsApp e e comparado em teste.
  return formatador.format(centavos / 100).replace(/\s/g, ' ')
}
