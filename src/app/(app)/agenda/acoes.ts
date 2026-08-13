'use server'

import { revalidatePath } from 'next/cache'
import { sincronizarAulas } from '@/dados/aulas'
import { gerarTokenPresenca } from '@/dados/presencas'
import { exigirGestora } from '@/dados/sessao'
import { clienteServidor } from '@/dados/cliente'

export async function sincronizar(de: string, ate: string) {
  await exigirGestora()
  const r = await sincronizarAulas(de, ate)
  revalidatePath('/agenda')
  return r
}

export async function criarLinkDeChamada(aulaId: number): Promise<string> {
  await exigirGestora()
  const token = await gerarTokenPresenca(aulaId)
  revalidatePath(`/agenda/aulas/${aulaId}`)
  return `/p/presenca/${token}`
}

export async function mudarStatusAula(
  aulaId: number,
  status: 'Agendada' | 'Cancelada' | 'Feriado',
) {
  await exigirGestora()
  const supabase = await clienteServidor()
  const { error } = await supabase.from('aulas').update({ status }).eq('id', aulaId)
  if (error) throw new Error(error.message)
  revalidatePath('/agenda')
  revalidatePath(`/agenda/aulas/${aulaId}`)
}
