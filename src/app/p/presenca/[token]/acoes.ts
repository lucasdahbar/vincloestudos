'use server'

import { registrarChamada } from '@/dados/presencas'
import type { RespostaChamada } from '@/dominio/presencas/registro'

export async function confirmarPresencas(token: string, respostas: RespostaChamada[]) {
  return registrarChamada(token, respostas)
}
