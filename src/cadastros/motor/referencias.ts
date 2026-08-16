import 'server-only'
import { clienteServidor } from '@/dados/cliente'
import type { DefinicaoCadastro } from '@/cadastros/tipos'
import type { OpcaoReferencia } from './CampoDinamico'

/**
 * Carrega as opcoes de cada campo `referencia`, so com registros ativos.
 *
 * As consultas vao em paralelo. Em serie, o formulario esperava a soma de todas:
 * o de Aluno tem duas referencias, entao pagava duas viagens ate o banco antes
 * de renderizar.
 */
export async function carregarReferencias(
  definicao: DefinicaoCadastro,
): Promise<Record<string, OpcaoReferencia[]>> {
  const supabase = await clienteServidor()
  const campos = definicao.campos.filter((c) => c.tipo === 'referencia' && c.referencia)

  const resultados = await Promise.all(
    campos.map(async (campo) => {
      const { data } = await supabase
        .from(campo.referencia!.tabela)
        .select(`id, ${campo.referencia!.rotulo}, ativo`)
        .order(campo.referencia!.rotulo)

      const opcoes = ((data ?? []) as unknown[])
        .filter((linha) => (linha as { ativo?: boolean }).ativo !== false)
        .map((linha) => ({
          id: (linha as { id: number }).id,
          rotulo: String((linha as Record<string, unknown>)[campo.referencia!.rotulo]),
        }))

      return [campo.nome, opcoes] as const
    }),
  )

  return Object.fromEntries(resultados)
}
