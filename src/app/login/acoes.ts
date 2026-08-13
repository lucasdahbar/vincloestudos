'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/dados/cliente'

export async function entrar(_anterior: string | null, dados: FormData): Promise<string | null> {
  const email = String(dados.get('email') ?? '').trim()
  const senha = String(dados.get('senha') ?? '')

  if (!email || !senha) return 'Preencha o e-mail e a senha.'

  const supabase = await clienteServidor()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) return 'E-mail ou senha incorretos. Confira e tente de novo.'

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function sair() {
  const supabase = await clienteServidor()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
