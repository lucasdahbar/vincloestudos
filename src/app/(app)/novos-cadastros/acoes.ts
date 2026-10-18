'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import {
  aprovarEnvio,
  cancelarConvite,
  criarConvite,
  recusarEnvio,
} from '@/dados/cadastro-publico'
import { exigirGestora } from '@/dados/sessao'

export async function gerarConvite(
  identificacao: string,
): Promise<{ ok: true; link: string } | { ok: false; motivo: string }> {
  await exigirGestora()
  const r = await criarConvite(identificacao)
  if (!r.ok) return r

  const cabecalhos = await headers()
  const anfitriao = cabecalhos.get('host') ?? ''
  const protocolo = anfitriao.startsWith('localhost') ? 'http' : 'https'
  revalidatePath('/novos-cadastros')
  return { ok: true, link: `${protocolo}://${anfitriao}/p/cadastro/${r.token}` }
}

export async function cancelar(conviteId: number) {
  await exigirGestora()
  const r = await cancelarConvite(conviteId)
  revalidatePath('/novos-cadastros')
  return r
}

export async function aprovar(envioId: number, responsavelExistente: number | null) {
  await exigirGestora()
  const r = await aprovarEnvio(envioId, responsavelExistente)
  revalidatePath('/novos-cadastros')
  revalidatePath('/cadastros/responsaveis')
  revalidatePath('/cadastros/alunos')
  return r
}

export async function recusar(envioId: number) {
  await exigirGestora()
  const r = await recusarEnvio(envioId)
  revalidatePath('/novos-cadastros')
  return r
}
