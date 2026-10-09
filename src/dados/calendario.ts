import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Feriado } from '@/dominio/agenda/feriados'
import type { RecessoEscolar } from '@/dominio/agenda/recessos'

export interface CalendarioEscolar {
  feriados: Feriado[]
  recessos: RecessoEscolar[]
}

/**
 * Feriados e recessos que encostam em [de, ate]. Um recesso que começou antes
 * da janela continua valendo dentro dela.
 */
export async function calendarioEscolar(
  db: SupabaseClient,
  de: string,
  ate: string,
): Promise<CalendarioEscolar> {
  const [feriados, recessos] = await Promise.all([
    db.from('feriados').select('data, nome').gte('data', de).lte('data', ate),
    db
      .from('recessos_escola')
      .select('escola_id, descricao, data_inicio, data_fim')
      .lte('data_inicio', ate)
      .gte('data_fim', de),
  ])

  return {
    feriados: (feriados.data ?? []).map((f) => ({ data: String(f.data).slice(0, 10), nome: f.nome })),
    recessos: (recessos.data ?? []).map((r) => ({
      escola_id: r.escola_id,
      descricao: r.descricao,
      data_inicio: String(r.data_inicio).slice(0, 10),
      data_fim: String(r.data_fim).slice(0, 10),
    })),
  }
}
