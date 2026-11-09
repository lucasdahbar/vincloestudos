'use server'

import { revalidatePath } from 'next/cache'
import {
  ajustarDesconto,
  aplicarDescontoEmLote,
  cancelarCobranca,
  confirmarCobranca,
  definirContaDeRecebimento,
  excluirItem,
  gerarCobrancasDoMes,
  marcarComoEnviada,
  reabrirCobranca,
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

export async function confirmar(cobrancaId: number): Promise<{ ok: boolean; erro?: string }> {
  const sessao = await exigirGestora()
  try {
    await confirmarCobranca(cobrancaId, sessao.nome)
  } catch (erro) {
    // Devolve a mensagem em vez de estourar: em producao um erro lancado numa
    // action vira tela de erro generica (ex.: "a cobranca mudou enquanto voce
    // confirmava").
    return { ok: false, erro: erro instanceof Error ? erro.message : 'Não foi possível confirmar.' }
  } finally {
    revalidatePath(`/cobrancas/${cobrancaId}`)
    revalidatePath('/cobrancas')
  }
  return { ok: true }
}

export async function marcarEnviada(cobrancaId: number) {
  await exigirGestora()
  await marcarComoEnviada(cobrancaId)
  revalidatePath(`/cobrancas/${cobrancaId}`)
}

/** C3: mesmo desconto para todas as aulas de um grupo (aluno + serviço). */
export async function descontoEmLote(
  cobrancaId: number,
  itemIds: number[],
  valorTexto: string,
) {
  await exigirGestora()
  const r = await aplicarDescontoEmLote(cobrancaId, itemIds, deReal(valorTexto || '0'))
  if (r.ok) revalidatePath(`/cobrancas/${cobrancaId}`)
  return r
}

/** C4: remove uma aula do rascunho, liberando-a para uma geração futura. */
export async function removerItem(itemId: number, cobrancaId: number) {
  await exigirGestora()
  const r = await excluirItem(itemId)
  if (r.ok) revalidatePath(`/cobrancas/${cobrancaId}`)
  return r
}

/** C5: qual chave Pix aparece no texto desta cobrança. */
export async function escolherContaDeRecebimento(cobrancaId: number, contaId: number | null) {
  await exigirGestora()
  const r = await definirContaDeRecebimento(cobrancaId, contaId)
  if (r.ok) revalidatePath(`/cobrancas/${cobrancaId}`)
  return r
}

/** Reabrir rascunho (09/11/2026): a confirmada não enviada volta a ser editável. */
export async function reabrir(cobrancaId: number) {
  const sessao = await exigirGestora()
  const r = await reabrirCobranca(cobrancaId, sessao.nome)
  if (r.ok) {
    revalidatePath(`/cobrancas/${cobrancaId}`)
    revalidatePath('/cobrancas')
    revalidatePath('/recebimentos')
  }
  return r
}

/** C7: cancela a cobrança e libera as aulas dela. */
export async function cancelar(cobrancaId: number) {
  const sessao = await exigirGestora()
  const r = await cancelarCobranca(cobrancaId, sessao.nome)
  if (r.ok) {
    revalidatePath(`/cobrancas/${cobrancaId}`)
    revalidatePath('/cobrancas')
  }
  return r
}
