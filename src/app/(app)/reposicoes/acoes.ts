'use server'

import { revalidatePath } from 'next/cache'
import { agendarReposicao, criarPendenciaManual, desistirReposicao } from '@/dados/reposicoes'
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

/**
 * R2: registra que o aluno avisou que nao vem a uma aula especifica.
 *
 * Revalida a agenda junto porque o aluno some da lista daquela aula na hora
 * (R3) — se so a tela de reposicoes atualizasse, a gestora veria o nome ainda
 * la e registraria de novo.
 */
export async function registrarFaltaAvisada(alunoId: number, aulaId: number) {
  await exigirGestora()
  const r = await criarPendenciaManual(alunoId, aulaId)
  revalidatePath('/reposicoes')
  revalidatePath('/agenda')
  revalidatePath(`/agenda/aulas/${aulaId}`)
  return r
}
