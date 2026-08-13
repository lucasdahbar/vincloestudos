export interface Feriado {
  data: string
  nome: string
}

export interface AulaParaConferir {
  id: number
  /** Data em ISO, AAAA-MM-DD. */
  data: string
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
}

export interface ConflitoFeriado {
  aulaId: number
  data: string
  feriado: string
}

/**
 * Modulos Operacionais 4.2: o sistema alerta a gestora quando uma aula coincide
 * com feriado, para que ela cancele, remarque ou mantenha — o sistema nunca
 * decide isso sozinho. Por isso esta funcao apenas relata.
 *
 * Aulas ja resolvidas (Cancelada, Feriado) ou ja ocorridas (Realizada) nao
 * entram: nao ha decisao pendente sobre elas.
 */
export function conflitosComFeriado(
  aulas: AulaParaConferir[],
  feriados: Feriado[],
): ConflitoFeriado[] {
  const porData = new Map(feriados.map((f) => [f.data, f.nome]))

  return aulas
    .filter((a) => a.status === 'Agendada')
    .filter((a) => porData.has(a.data))
    .map((a) => ({ aulaId: a.id, data: a.data, feriado: porData.get(a.data)! }))
}
