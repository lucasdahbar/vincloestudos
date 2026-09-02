'use server'

import { registrarChamada } from '@/dados/presencas'
import { registrarChamadaDoProfessor } from '@/dados/presenca-professor'
import type { RespostaChamada } from '@/dominio/presencas/registro'

export async function confirmarPresencas(token: string, respostas: RespostaChamada[]) {
  return registrarChamada(token, respostas)
}

/** R1: chamada vinda do link permanente do professor. */
export async function confirmarPresencasDoProfessor(
  token: string,
  aulaId: number,
  respostas: RespostaChamada[],
) {
  return registrarChamadaDoProfessor(token, aulaId, respostas)
}
