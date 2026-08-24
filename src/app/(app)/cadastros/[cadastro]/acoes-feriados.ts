'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { buscarFeriadosNacionais, feriadosQueFaltam } from '@/dominio/feriados/nacionais'

export interface ResultadoImportacao {
  ok: boolean
  criados?: number
  jaExistiam?: number
  motivo?: string
}

/**
 * Importa os feriados nacionais de um ano (sugestao do QA).
 *
 * So acrescenta o que falta, comparando por data: rodar duas vezes nao duplica,
 * e um feriado que a gestora ja cadastrou a mao com outro nome nao vira uma
 * segunda linha no mesmo dia.
 */
export async function importarFeriadosNacionais(ano: number): Promise<ResultadoImportacao> {
  const sessao = await exigirGestora()

  const r = await buscarFeriadosNacionais(ano)
  if (!r.ok) return { ok: false, motivo: r.motivo }

  const supabase = await clienteServidor()
  const { data: existentes, error: erroLeitura } = await supabase
    .from('feriados')
    .select('data')
    .gte('data', `${ano}-01-01`)
    .lte('data', `${ano}-12-31`)

  if (erroLeitura) return { ok: false, motivo: `Falha ao ler os feriados: ${erroLeitura.message}` }

  const faltando = feriadosQueFaltam(
    r.feriados,
    (existentes ?? []).map((f) => String(f.data)),
  )

  if (faltando.length === 0) {
    return { ok: true, criados: 0, jaExistiam: r.feriados.length }
  }

  const { error } = await supabase
    .from('feriados')
    .insert(faltando.map((f) => ({ data: f.data, nome: f.nome, abrangencia: 'Nacional' })))

  if (error) return { ok: false, motivo: `Falha ao gravar: ${error.message}` }

  await supabase.from('logs_operacionais').insert({
    acao: 'importar_feriados_nacionais',
    entidade: 'feriados',
    usuario: sessao.nome,
    detalhe: { ano, criados: faltando.length, fonte: 'BrasilAPI' },
  })

  revalidatePath('/cadastros/feriados')
  revalidatePath('/agenda')

  return { ok: true, criados: faltando.length, jaExistiam: r.feriados.length - faltando.length }
}
