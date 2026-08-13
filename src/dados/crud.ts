import 'server-only'
import { clienteServidor } from './cliente'
import type { DefinicaoCadastro } from '@/cadastros/tipos'

export interface Registro {
  id: number
  [coluna: string]: unknown
}

/** Monta o `select` do PostgREST incluindo o rotulo de cada referencia. */
function selectDe(definicao: DefinicaoCadastro): string {
  const colunas = ['id', ...definicao.campos.map((c) => c.nome)]
  const juncoes = definicao.campos
    .filter((c) => c.tipo === 'referencia' && c.referencia)
    .map((c) => `${c.nome}_ref:${c.referencia!.tabela}!${c.nome}(id, ${c.referencia!.rotulo})`)
  return [...colunas, ...juncoes].join(', ')
}

export async function listar(
  definicao: DefinicaoCadastro,
  opcoes: { busca?: string; somenteAtivos?: boolean } = {},
): Promise<Registro[]> {
  const supabase = await clienteServidor()
  let consulta = supabase.from(definicao.tabela).select(selectDe(definicao))

  if (opcoes.busca && definicao.camposBuscaveis.length > 0) {
    const termo = opcoes.busca.replace(/[%,()]/g, '')
    const clausulas = definicao.camposBuscaveis.map((c) => `${c.nome}.ilike.%${termo}%`)
    consulta = consulta.or(clausulas.join(','))
  }

  if (opcoes.somenteAtivos && definicao.campos.some((c) => c.nome === 'ativo')) {
    consulta = consulta.eq('ativo', true)
  }

  const { data, error } = await consulta.order(definicao.ordenacao.coluna, {
    ascending: definicao.ordenacao.ascendente ?? true,
  })

  if (error) throw new Error(`Falha ao listar ${definicao.rotulo.plural}: ${error.message}`)
  return (data ?? []) as unknown as Registro[]
}

export async function obter(
  definicao: DefinicaoCadastro,
  id: number,
): Promise<Registro | null> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase
    .from(definicao.tabela)
    .select(selectDe(definicao))
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar ${definicao.rotulo.singular}: ${error.message}`)
  return (data ?? null) as unknown as Registro | null
}

export async function criar(
  definicao: DefinicaoCadastro,
  valores: Record<string, unknown>,
): Promise<number> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase
    .from(definicao.tabela)
    .insert(valores)
    .select('id')
    .single()

  if (error) throw new Error(traduzirErro(error.message, definicao))
  return data.id as number
}

export async function atualizar(
  definicao: DefinicaoCadastro,
  id: number,
  valores: Record<string, unknown>,
): Promise<void> {
  const supabase = await clienteServidor()
  const { error } = await supabase.from(definicao.tabela).update(valores).eq('id', id)
  if (error) throw new Error(traduzirErro(error.message, definicao))
}

// Registros nunca sao removidos: cadastros sao referenciados por historico
// financeiro. Desativar (campo `ativo`) preserva o passado e some das listas
// de escolha. A alternancia usa `atualizar` direto, em `motor/acoes.ts`.

/** Mensagens do Postgres nao servem para a gestora. Estas servem. */
function traduzirErro(mensagem: string, definicao: DefinicaoCadastro): string {
  if (mensagem.includes('duplicate key')) {
    return `Já existe ${definicao.rotulo.genero === 'f' ? 'uma' : 'um'} ${definicao.rotulo.singular.toLowerCase()} com esses dados.`
  }
  if (mensagem.includes('violates foreign key')) {
    return 'Um dos itens selecionados não existe mais. Recarregue a página e tente de novo.'
  }
  if (mensagem.includes('violates row-level security')) {
    return 'Você não tem permissão para esta ação.'
  }
  return mensagem
}
