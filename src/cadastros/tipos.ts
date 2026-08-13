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
  // `z.ZodRawShape` e readonly no Zod 4, entao a forma e construida de uma vez
  // em vez de por mutacao.
  const forma = Object.fromEntries(
    entrada.campos.map((campo) => [campo.nome, campo.schema]),
  ) as z.ZodRawShape

  return {
    ...entrada,
    schema: z.object(forma),
    camposDaLista: entrada.campos.filter((c) => c.naLista),
    camposBuscaveis: entrada.campos.filter((c) => c.buscavel),
  }
}

/**
 * Versao de um campo sem o schema Zod. Schemas sao instancias de classe e nao
 * atravessam a fronteira Server -> Client do React: passar a definicao completa
 * para um Client Component quebra a renderizacao em runtime.
 */
export type CampoCliente = Omit<DefinicaoCampo, 'schema'>

/** Versao do cadastro sem os schemas, segura para atravessar a fronteira RSC. */
export interface CadastroCliente {
  tabela: string
  rota: string
  rotulo: { singular: string; plural: string; genero: 'm' | 'f' }
  ordenacao: { coluna: string; ascendente?: boolean }
  dicaVazio?: string
  campos: CampoCliente[]
  camposDaLista: CampoCliente[]
  camposBuscaveis: CampoCliente[]
}

/** Descarta os schemas. Chame sempre que a definicao for para um Client Component. */
export function paraCliente(definicao: DefinicaoCadastro): CadastroCliente {
  const semSchema = ({ schema: _schema, ...resto }: DefinicaoCampo): CampoCliente => resto
  return {
    tabela: definicao.tabela,
    rota: definicao.rota,
    rotulo: definicao.rotulo,
    ordenacao: definicao.ordenacao,
    dicaVazio: definicao.dicaVazio,
    campos: definicao.campos.map(semSchema),
    camposDaLista: definicao.camposDaLista.map(semSchema),
    camposBuscaveis: definicao.camposBuscaveis.map(semSchema),
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
  definicao: CadastroCliente,
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
