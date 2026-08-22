'use server'

import { revalidatePath } from 'next/cache'
import { atualizar, criar } from '@/dados/crud'
import { exigirGestora } from '@/dados/sessao'
import { CADASTROS } from '@/cadastros/definicoes'
import { deReal } from '@/dominio/dinheiro'

export interface ResultadoSalvar {
  ok: boolean
  mensagem?: string
  errosPorCampo?: Record<string, string>
  id?: number
}

/** Converte os valores da UI para o formato aceito pelo banco. */
function normalizar(rota: string, valores: Record<string, unknown>) {
  const definicao = CADASTROS[rota]
  const saida: Record<string, unknown> = {}

  for (const campo of definicao.campos) {
    const bruto = valores[campo.nome]

    if (campo.tipo === 'dinheiro') {
      saida[campo.nome] = (deReal(String(bruto ?? '0')) / 100).toFixed(2)
    } else if (campo.tipo === 'percentual') {
      saida[campo.nome] = Number(String(bruto ?? '0').replace(',', '.'))
    } else if (typeof bruto === 'string' && bruto.trim() === '') {
      saida[campo.nome] = campo.tipo === 'texto' || campo.tipo === 'texto-longo' ? null : null
    } else {
      saida[campo.nome] = bruto
    }
  }

  return saida
}

export async function salvarCadastro(
  rota: string,
  id: number | null,
  valores: Record<string, unknown>,
): Promise<ResultadoSalvar> {
  await exigirGestora()

  const definicao = CADASTROS[rota]
  if (!definicao) return { ok: false, mensagem: 'Cadastro desconhecido.' }

  const validacao = definicao.schema.safeParse(valores)
  if (!validacao.success) {
    const errosPorCampo: Record<string, string> = {}
    for (const issue of validacao.error.issues) {
      const campo = String(issue.path[0] ?? '')
      if (campo && !errosPorCampo[campo]) errosPorCampo[campo] = issue.message
    }
    return { ok: false, mensagem: 'Confira os campos destacados.', errosPorCampo }
  }

  try {
    const dados = normalizar(rota, validacao.data as Record<string, unknown>)
    const idFinal = id === null ? await criar(definicao, dados) : (await atualizar(definicao, id, dados), id)
    revalidatePath(`/cadastros/${rota}`)
    return { ok: true, id: idFinal }
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error ? erro.message : 'Erro ao salvar.' }
  }
}

export async function alternarAtivoCadastro(rota: string, id: number, ativo: boolean) {
  await exigirGestora()
  const definicao = CADASTROS[rota]
  await atualizar(definicao, id, { ativo })
  revalidatePath(`/cadastros/${rota}`)
}

/** Previa da exclusao: diz o que vai acontecer antes de acontecer (LGPD). */
export async function consultarExclusao(entidade: string, id: number) {
  await exigirGestora()
  const { previaExclusao } = await import('@/dados/lgpd')
  return previaExclusao(entidade as 'professores' | 'responsaveis' | 'alunos', id)
}

export async function excluirCadastro(entidade: string, id: number) {
  const sessao = await exigirGestora()
  const { executarExclusao } = await import('@/dados/lgpd')
  const r = await executarExclusao(
    entidade as 'professores' | 'responsaveis' | 'alunos',
    id,
    sessao.nome,
  )
  revalidatePath(`/cadastros`, 'layout')
  return r
}
