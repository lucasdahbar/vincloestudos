'use server'

import { revalidatePath } from 'next/cache'
import { sincronizarAulas } from '@/dados/aulas'
import { gerarTokenPresenca, reabrirChamada, tokenDaAula } from '@/dados/presencas'
import { bloqueioDaChamada, corrigirChamadaDaAula } from '@/dados/corrigir-chamada'
import type { RespostaChamada } from '@/dominio/presencas/registro'
import { exigirGestora } from '@/dados/sessao'
import { clienteServidor } from '@/dados/cliente'
import { after } from 'next/server'
import { executarExclusaoAula, previaExclusaoAula, type PreviaExclusaoAula } from '@/dados/exclusao-aula'
import { atualizarAlunosNosEventos, sincronizarEventoDaTurma } from '@/dados/evento-da-turma'
import type { EscolhaRegular, EscolhaReposicao } from '@/dominio/agenda/exclusao-aula'
import { registrarEnvioDeLink } from '@/dados/links-da-aula'
import type { CanalEnvio } from '@/dominio/notificacoes/mensagens'

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
export async function reabrirChamadaDaAula(
  aulaId: number,
): Promise<{ ok: true; caminho: string | null } | { ok: false; erro: string }> {
  await exigirGestora()
  // Pagamento do professor fechado: a chamada nao se mexe mais (13/10/2026).
  const bloqueio = await bloqueioDaChamada(aulaId)
  if (bloqueio) return { ok: false, erro: bloqueio }

  const existente = await tokenDaAula(aulaId)
  if (!existente) return { ok: true, caminho: null }
  await reabrirChamada(existente.token)
  revalidatePath(`/agenda/aulas/${aulaId}`)
  return { ok: true, caminho: `/p/presenca/${existente.token}` }
}

/**
 * A gestora corrige a chamada direto, sem depender do professor (pedido do
 * tio, 13/10/2026). Bloqueia se o pagamento do professor ja fechou.
 */
export async function corrigirChamada(
  aulaId: number,
  respostas: RespostaChamada[],
): Promise<{ ok: boolean; erro?: string }> {
  const sessao = await exigirGestora()
  const bloqueio = await bloqueioDaChamada(aulaId)
  if (bloqueio) return { ok: false, erro: bloqueio }

  const r = await corrigirChamadaDaAula(aulaId, respostas, sessao.nome)
  if (!r.ok) return { ok: false, erro: r.motivo }

  revalidatePath(`/agenda/aulas/${aulaId}`)
  revalidatePath('/agenda', 'layout')
  revalidatePath('/reposicoes')
  revalidatePath('/pagamentos', 'layout')
  return { ok: true }
}

export async function mudarStatusAula(
  aulaId: number,
  status: 'Agendada' | 'Cancelada' | 'Feriado',
) {
  await exigirGestora()
  const supabase = await clienteServidor()

  // Aula excluída não volta por aqui: a exclusão já transferiu os alunos para
  // reposição, e reativá-la os deixaria em dois lugares.
  const { data: atual, error: erroLeitura } = await supabase
    .from('aulas')
    .select('status')
    .eq('id', aulaId)
    .maybeSingle()
  if (erroLeitura) throw new Error(erroLeitura.message)
  if (!atual) throw new Error('Esta aula não existe mais.')
  if (atual.status === 'Excluída') throw new Error('Esta aula foi excluída e não pode mudar de status.')

  const { error } = await supabase
    .from('aulas')
    .update({ status })
    .eq('id', aulaId)
    .neq('status', 'Excluída')
  if (error) throw new Error(error.message)
  revalidatePath('/agenda')
  revalidatePath(`/agenda/aulas/${aulaId}`)
}

export async function consultarExclusaoAula(aulaId: number): Promise<PreviaExclusaoAula | null> {
  await exigirGestora()
  return previaExclusaoAula(aulaId)
}

export async function excluirAula(
  aulaId: number,
  regulares: EscolhaRegular[],
  reposicoes: EscolhaReposicao[],
): Promise<{ ok: boolean; erros?: string[] }> {
  await exigirGestora()
  const r = await executarExclusaoAula(aulaId, regulares, reposicoes)
  if (!r.ok) return r

  // A data vira exceção no evento do Google.
  after(async () => {
    try {
      const s = await sincronizarEventoDaTurma(r.turmaId)
      if (!s.ok) console.warn('evento nao atualizado apos excluir aula:', s.motivo)
    } catch (e) {
      console.error('falha ao atualizar o evento apos excluir aula:', e)
    }
    // Quem foi repor em outra turma passa a constar no evento dela.
    await atualizarAlunosNosEventos(r.turmasDestino)
  })

  revalidatePath('/agenda')
  revalidatePath(`/agenda/aulas/${aulaId}`)
  revalidatePath('/reposicoes')
  return { ok: true }
}

/**
 * O link da aula saiu para um aluno ou responsavel (pedido de 16/10/2026): o
 * clique no botao ja registra, sem o "Ja enviei" da fila antiga.
 */
export async function registrarEnvioDoLink(
  aulaId: number,
  alunoId: number,
  destinatarioTipo: 'aluno' | 'responsavel',
  canal: CanalEnvio,
): Promise<{ ok: true; enviado_em: string } | { ok: false; motivo: string }> {
  await exigirGestora()
  const r = await registrarEnvioDeLink(aulaId, alunoId, destinatarioTipo, canal)
  if (r.ok) revalidatePath(`/agenda/aulas/${aulaId}`)
  return r
}
