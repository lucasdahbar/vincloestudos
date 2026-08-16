'use server'

import { revalidatePath } from 'next/cache'
import { sincronizarAulas } from '@/dados/aulas'
import { gerarTokenPresenca, reabrirChamada, tokenDaAula } from '@/dados/presencas'
import { exigirGestora } from '@/dados/sessao'
import { clienteServidor } from '@/dados/cliente'

export async function sincronizar(de: string, ate: string) {
  await exigirGestora()
  const r = await sincronizarAulas(de, ate)
  revalidatePath('/agenda')
  return r
}

/**
 * Devolve o link da chamada, reaproveitando o token valido se ja existir.
 *
 * Gerar um token novo a cada clique invalidaria na pratica o link que a gestora
 * ja tivesse enviado ao professor.
 */
export async function criarLinkDeChamada(aulaId: number): Promise<string> {
  await exigirGestora()
  const existente = await tokenDaAula(aulaId)
  const token = existente && !existente.usado_em ? existente.token : await gerarTokenPresenca(aulaId)
  revalidatePath(`/agenda/aulas/${aulaId}`)
  return `/p/presenca/${token}`
}

/** Reabre a chamada ja confirmada, para o professor corrigir (Operacionais 5.5). */
export async function reabrirChamadaDaAula(aulaId: number): Promise<string | null> {
  await exigirGestora()
  const existente = await tokenDaAula(aulaId)
  if (!existente) return null
  await reabrirChamada(existente.token)
  revalidatePath(`/agenda/aulas/${aulaId}`)
  return `/p/presenca/${existente.token}`
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
