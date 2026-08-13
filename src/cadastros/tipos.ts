import { z } from 'zod'

export type TipoCampo =
  | 'texto'
  | 'texto-longo'
  | 'numero'
  | 'dinheiro'
  | 'percentual'
  | 'data'
  | 'booleano'
  | 'selecao'
  | 'referencia'

export interface DefinicaoCampo {
  nome: string
  etiqueta: string
  tipo: TipoCampo
  schema: z.ZodTypeAny
  /** Explicacao em linguagem comum, exibida sob a etiqueta. */
  ajuda?: string
  /** Marca o asterisco no formulario. Declarado, nao inferido do Zod. */
  obrigatorio?: boolean
  padrao?: unknown
  /** Aparece na tabela de listagem. */
  naLista?: boolean
  /** Entra na busca por texto livre. */
  buscavel?: boolean
  /** Opcoes para `selecao`. */
  opcoes?: readonly string[]
  /** Tabela alvo para `referencia`. */
  referencia?: { tabela: string; rotulo: string; rota?: string }
}

export interface DefinicaoCadastro {
  tabela: string
  rota: string
  rotulo: { singular: string; plural: string; genero: 'm' | 'f' }
  ordenacao: { coluna: string; ascendente?: boolean }
  campos: DefinicaoCampo[]
  /** Texto do estado vazio. Sempre nomeia o proximo passo. */
  dicaVazio?: string
  schema: z.ZodObject<z.ZodRawShape>
  camposDaLista: DefinicaoCampo[]
  camposBuscaveis: DefinicaoCampo[]
}

type EntradaDefinicao = Omit<
  DefinicaoCadastro,
  'schema' | 'camposDaLista' | 'camposBuscaveis'
>

export function defineCadastro(entrada: EntradaDefinicao): DefinicaoCadastro {
  const forma: z.ZodRawShape = {}
  for (const campo of entrada.campos) forma[campo.nome] = campo.schema

  return {
    ...entrada,
    schema: z.object(forma),
    camposDaLista: entrada.campos.filter((c) => c.naLista),
    camposBuscaveis: entrada.campos.filter((c) => c.buscavel),
  }
}

const VAZIO_POR_TIPO: Record<TipoCampo, unknown> = {
  texto: '',
  'texto-longo': '',
  numero: null,
  dinheiro: '',
  percentual: '',
  data: '',
  booleano: false,
  selecao: '',
  referencia: null,
}

export function valoresIniciais(
  definicao: DefinicaoCadastro,
  registro?: Record<string, unknown>,
): Record<string, unknown> {
  const valores: Record<string, unknown> = {}
  for (const campo of definicao.campos) {
    if (registro && campo.nome in registro) {
      valores[campo.nome] = registro[campo.nome]
    } else if ('padrao' in campo) {
      valores[campo.nome] = campo.padrao
    } else {
      valores[campo.nome] = VAZIO_POR_TIPO[campo.tipo]
    }
  }
  return valores
}
