'use server'

import { revalidatePath } from 'next/cache'
import { marcarEnviada } from '@/dados/notificacoes'
import { exigirGestora } from '@/dados/sessao'

export async function confirmarEnvio(id: number) {
  await exigirGestora()
  await marcarEnviada(id)
  revalidatePath('/mensagens')
}
