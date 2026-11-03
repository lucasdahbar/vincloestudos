'use server'

import { revalidatePath } from 'next/cache'
import { exigirGestora } from '@/dados/sessao'
import { restaurarModelo, salvarModelo, type Resultado } from '@/dados/mensagens-modelo'

/**
 * O texto muda em varias telas (agenda, cadastro do professor, novos
 * cadastros, mensagens), e todas leem na hora de abrir: basta invalidar o
 * layout inteiro em vez de listar uma a uma e esquecer a proxima.
 */
function atualizarTelas() {
  revalidatePath('/', 'layout')
}

export async function salvarTextoDaMensagem(chave: string, texto: string): Promise<Resultado> {
  const sessao = await exigirGestora()
  const r = await salvarModelo(chave, texto, sessao.nome)
  if (r.ok) atualizarTelas()
  return r
}

export async function restaurarTextoDaMensagem(chave: string): Promise<Resultado> {
  const sessao = await exigirGestora()
  const r = await restaurarModelo(chave, sessao.nome)
  if (r.ok) atualizarTelas()
  return r
}
