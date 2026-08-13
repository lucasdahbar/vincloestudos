'use server'

import { revalidatePath } from 'next/cache'
import { agendarReposicao, desistirReposicao } from '@/dados/reposicoes'
import { exigirGestora } from '@/dados/sessao'

export async function agendar(pendenciaId: number, aulaDestinoId: number) {
  await exigirGestora()
  const r = await agendarReposicao(pendenciaId, aulaDestinoId)
  revalidatePath('/reposicoes')
  return r
}

export async function desistir(pendenciaId: number) {
  await exigirGestora()
  const r = await desistirReposicao(pendenciaId)
  revalidatePath('/reposicoes')
  return r
}
