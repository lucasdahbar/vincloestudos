'use server'

import { revalidatePath } from 'next/cache'
import { desconectar } from '@/agenda/credenciais'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'

/**
 * Remove a autorização guardada.
 *
 * Não revoga do lado do Google — isso é feito em myaccount.google.com. Aqui
 * só apaga o token, que é o que impede o sistema de continuar escrevendo.
 */
export async function desconectarGoogle() {
  const sessao = await exigirGestora()
  await desconectar()

  const supabase = await clienteServidor()
  await supabase.from('logs_operacionais').insert({
    acao: 'desconectar_google_agenda',
    entidade: 'google_oauth',
    usuario: sessao.nome,
    detalhe: {},
  })

  revalidatePath('/cadastros/integracoes')
}
