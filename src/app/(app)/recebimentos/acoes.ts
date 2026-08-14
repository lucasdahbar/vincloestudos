'use server'

import { revalidatePath } from 'next/cache'
import { registrarRecebimento } from '@/dados/recebimentos'
import { exigirGestora } from '@/dados/sessao'
import { deReal } from '@/dominio/dinheiro'

export async function darBaixa(entrada: {
  cobrancaId: number
  valorTexto: string
  data: string
  contaId: number | null
  formaPagamento: string | null
  observacao: string | null
}) {
  const sessao = await exigirGestora()

  let valor: number
  try {
    valor = deReal(entrada.valorTexto)
  } catch {
    return { ok: false, erros: ['Valor inválido. Use o formato 1.234,56.'] }
  }

  const r = await registrarRecebimento({
    cobrancaId: entrada.cobrancaId,
    valor,
    data: entrada.data,
    contaId: entrada.contaId,
    formaPagamento: entrada.formaPagamento,
    observacao: entrada.observacao,
    usuario: sessao.nome,
  })

  revalidatePath('/recebimentos')
  revalidatePath(`/cobrancas/${entrada.cobrancaId}`)
  return r
}
