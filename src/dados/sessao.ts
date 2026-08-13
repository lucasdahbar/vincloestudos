import 'server-only'
import { redirect } from 'next/navigation'
import { clienteServidor } from './cliente'
import type { Papel } from '@/dominio/tipos'

export interface SessaoAtual {
  usuarioId: string
  nome: string
  papel: Papel
  professorId: number | null
}

export async function sessaoAtual(): Promise<SessaoAtual | null> {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('perfis')
    .select('nome, papel, professor_id')
    .eq('usuario_id', user.id)
    .single()

  if (!perfil) return null

  return {
    usuarioId: user.id,
    nome: perfil.nome,
    papel: perfil.papel,
    professorId: perfil.professor_id,
  }
}

/** Usar no topo de toda pagina protegida. */
export async function exigirSessao(): Promise<SessaoAtual> {
  const sessao = await sessaoAtual()
  if (!sessao) redirect('/login')
  return sessao
}

export async function exigirGestora(): Promise<SessaoAtual> {
  const sessao = await exigirSessao()
  if (sessao.papel !== 'gestora') redirect('/')
  return sessao
}
