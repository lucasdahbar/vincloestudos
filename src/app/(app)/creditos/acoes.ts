'use server'

import { revalidatePath } from 'next/cache'
import { abaterCredito, devolverCredito } from '@/dados/creditos'
import { exigirGestora } from '@/dados/sessao'
import { deReal, type Centavos } from '@/dominio/dinheiro'

/** `deReal` estoura com texto inválido; aqui vira mensagem para a gestora. */
function lerValor(valor: string): Centavos | null {
  try {
    return deReal(valor)
  } catch {
    return null
  }
}

const VALOR_INVALIDO = { ok: false, erros: ['Digite o valor em reais, por exemplo 90,00.'] }

export async function abater(creditoId: number, cobrancaId: number, valor: string) {
  const sessao = await exigirGestora()
  const centavos = lerValor(valor)
  if (centavos === null) return VALOR_INVALIDO

  const r = await abaterCredito({ creditoId, cobrancaId, valor: centavos, usuario: sessao.nome })
  revalidatePath('/creditos')
  revalidatePath('/cobrancas', 'layout')
  revalidatePath('/recebimentos')
  return r
}

export async function devolver(
  creditoId: number,
  valor: string,
  contaId: number | null,
  observacao: string,
) {
  const sessao = await exigirGestora()
  const centavos = lerValor(valor)
  if (centavos === null) return VALOR_INVALIDO

  const r = await devolverCredito({
    creditoId,
    valor: centavos,
    contaId,
    observacao: observacao.trim() || null,
    usuario: sessao.nome,
  })
  revalidatePath('/creditos')
  return r
}
