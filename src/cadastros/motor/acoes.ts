'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { atualizar, criar, obter } from '@/dados/crud'
import { aplicarMudancaDeCalendario, type MudancaDeCalendario } from '@/dados/limpeza-aulas'
import { atualizarAlunosNosEventos, turmasDoAluno } from '@/dados/evento-da-turma'
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

/** O trecho do calendário que um feriado ou recesso ocupa. */
function trechoDoCalendario(rota: string, v: Record<string, unknown> | null): MudancaDeCalendario | null {
  if (!v) return null
  if (rota === 'feriados' && v.data) return { de: String(v.data), ate: String(v.data), escolaId: null }
  if (rota === 'recessos' && v.data_inicio && v.data_fim) {
    return { de: String(v.data_inicio), ate: String(v.data_fim), escolaId: v.escola_id ? Number(v.escola_id) : null }
  }
  return null
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
    // Na edição, o trecho antigo também muda (a exceção dele sai do Google).
    const eCalendario = rota === 'feriados' || rota === 'recessos'
    const antigo = eCalendario && id !== null ? await obter(definicao, id) : null
    const dados = normalizar(rota, validacao.data as Record<string, unknown>)
    const idFinal = id === null ? await criar(definicao, dados) : (await atualizar(definicao, id, dados), id)

    // O nome do aluno esta na descricao do evento das turmas dele no Google.
    if (rota === 'alunos' && id !== null) {
      after(async () => atualizarAlunosNosEventos(await turmasDoAluno(id)))
    }

    // Rodada 4: a turma recorrente não tem aula em feriado nem em recesso.
    if (rota === 'feriados' || rota === 'recessos') {
      const mudancas = [trechoDoCalendario(rota, dados), trechoDoCalendario(rota, antigo as Record<string, unknown> | null)]
        .filter((m): m is MudancaDeCalendario => m !== null)
      after(() => aplicarMudancaDeCalendario(mudancas))
      revalidatePath('/agenda')
    }

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

  // Lidas ANTES: depois da exclusao nao ha mais de onde saber em que turmas o
  // aluno estava, e o nome dele ficaria no Google — o contrario do que a LGPD pede.
  const turmas = entidade === 'alunos' ? await turmasDoAluno(id) : []

  const r = await executarExclusao(
    entidade as 'professores' | 'responsaveis' | 'alunos',
    id,
    sessao.nome,
  )
  if (r.ok) after(() => atualizarAlunosNosEventos(turmas))

  revalidatePath(`/cadastros`, 'layout')
  return r
}
