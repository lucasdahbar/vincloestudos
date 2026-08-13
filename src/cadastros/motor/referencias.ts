import 'server-only'
import { clienteServidor } from '@/dados/cliente'
import type { DefinicaoCadastro } from '@/cadastros/tipos'
import type { OpcaoReferencia } from './CampoDinamico'

/** Carrega as opcoes de cada campo `referencia`, so com registros ativos. */
export async function carregarReferencias(
  definicao: DefinicaoCadastro,
): Promise<Record<string, OpcaoReferencia[]>> {
  const supabase = await clienteServidor()
  const referencias: Record<string, OpcaoReferencia[]> = {}

  for (const campo of definicao.campos) {
    if (campo.tipo !== 'referencia' || !campo.referencia) continue

    const { data } = await supabase
      .from(campo.referencia.tabela)
      .select(`id, ${campo.referencia.rotulo}, ativo`)
      .order(campo.referencia.rotulo)

    referencias[campo.nome] = ((data ?? []) as unknown[])
      .filter((linha) => (linha as { ativo?: boolean }).ativo !== false)
      .map((linha) => ({
        id: (linha as { id: number }).id,
        rotulo: String((linha as Record<string, unknown>)[campo.referencia!.rotulo]),
      }))
  }

  return referencias
}
