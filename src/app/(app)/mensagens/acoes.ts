'use server'

import { revalidatePath } from 'next/cache'
import { enfileirarLembretesDeAula, marcarEnviada } from '@/dados/notificacoes'
import { exigirGestora } from '@/dados/sessao'

export async function prepararLembretes() {
  await exigirGestora()
  const total = await enfileirarLembretesDeAula(48)
  revalidatePath('/mensagens')
  return total
}

export async function confirmarEnvio(id: number) {
  await exigirGestora()
  await marcarEnviada(id)
  revalidatePath('/mensagens')
}
