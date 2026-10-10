import type { Feriado } from './feriados'
import type { RecessoEscolar } from './recessos'
import { somarDias } from './recorrencia'

/**
 * Rodada 4: os dias em que a turma recorrente não tem aula, com o motivo.
 *
 * Feriado vale para todas as turmas; recesso só para a turma da escola dele —
 * a mesma regra do alerta de recesso (C2). Turma sem escola nunca cai em
 * recesso.
 */
export interface MotivoDaPulada {
  tipo: 'feriado' | 'recesso'
  nome: string
}

export function datasPuladas(
  escolaId: number | null,
  feriados: Feriado[],
  recessos: RecessoEscolar[],
  de: string,
  ate: string,
): Map<string, MotivoDaPulada> {
  const puladas = new Map<string, MotivoDaPulada>()

  if (escolaId !== null) {
    for (const r of recessos) {
      if (r.escola_id !== escolaId) continue
      const inicio = r.data_inicio > de ? r.data_inicio : de
      const fim = r.data_fim < ate ? r.data_fim : ate
      for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
        puladas.set(d, { tipo: 'recesso', nome: r.descricao })
      }
    }
  }

  // Depois do recesso: no mesmo dia, o nome do feriado explica melhor.
  for (const f of feriados) {
    if (f.data >= de && f.data <= ate) puladas.set(f.data, { tipo: 'feriado', nome: f.nome })
  }

  return puladas
}

/**
 * O aviso da turma de aula única marcada num feriado ou recesso. Só avisa: a
 * gestora pode criar mesmo assim (spec 4.3).
 */
export function alertaDaData(
  data: string,
  escolaId: number | null,
  feriados: Feriado[],
  recessos: RecessoEscolar[],
): string | null {
  const motivo = datasPuladas(escolaId, feriados, recessos, data, data).get(data)
  if (!motivo) return null

  const [ano, mes, dia] = data.split('-')
  const quando = `${dia}/${mes}/${ano}`
  return motivo.tipo === 'feriado'
    ? `${quando} é feriado (${motivo.nome}).`
    : `${quando} cai no recesso da escola (${motivo.nome}).`
}
