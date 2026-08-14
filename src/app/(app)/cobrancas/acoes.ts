'use server'

import { revalidatePath } from 'next/cache'
import {
  ajustarDesconto,
  confirmarCobranca,
  gerarCobrancasDoMes,
  marcarComoEnviada,
} from '@/dados/cobrancas'
import { exigirGestora } from '@/dados/sessao'
import { deReal } from '@/dominio/dinheiro'

export async function gerar(mes: string) {
  await exigirGestora()
  const r = await gerarCobrancasDoMes(mes)
  revalidatePath('/cobrancas')
  return r
}

export async function salvarDesconto(itemId: number, cobrancaId: number, valorTexto: string) {
  await exigirGestora()
  try {
    await ajustarDesconto(itemId, deReal(valorTexto || '0'))
    revalidatePath(`/cobrancas/${cobrancaId}`)
    return { ok: true }
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : 'Falha ao ajustar.' }
  }
}

export async function confirmar(cobrancaId: number) {
  const sessao = await exigirGestora()
  await confirmarCobranca(cobrancaId, sessao.nome)
  revalidatePath(`/cobrancas/${cobrancaId}`)
  revalidatePath('/cobrancas')
}

export async function marcarEnviada(cobrancaId: number) {
  await exigirGestora()
  await marcarComoEnviada(cobrancaId)
  revalidatePath(`/cobrancas/${cobrancaId}`)
}
