/**
 * C2 (Rodada 2): recesso escolar.
 *
 * Diferente de feriado. Feriado e uma data do pais, do estado ou do municipio e
 * vale para todo mundo; recesso e um intervalo do calendario de UMA escola —
 * duas escolas podem estar de recesso em semanas diferentes.
 *
 * Por isso a aula so entra em conflito quando a turma e daquela escola. Uma
 * turma sem escola (aula particular, por exemplo) nunca cai em recesso.
 */
export interface RecessoEscolar {
  escola_id: number
  descricao: string
  /** Datas em ISO (AAAA-MM-DD), inclusive nas duas pontas. */
  data_inicio: string
  data_fim: string
}

export interface AulaComEscola {
  id: number
  data: string
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
  /** Escola da turma. `null` quando a turma nao e ligada a uma escola. */
  escola_id: number | null
}

export interface ConflitoRecesso {
  aulaId: number
  data: string
  recesso: string
}

/**
 * Igual ao alerta de feriado (Operacionais 4.2), esta funcao apenas RELATA. A
 * decisao de cancelar, remarcar ou manter a aula continua sendo da gestora.
 *
 * Aula ja resolvida (Cancelada, Feriado) ou ja ocorrida (Realizada) nao entra:
 * nao ha decisao pendente sobre ela.
 */
export function conflitosComRecesso(
  aulas: AulaComEscola[],
  recessos: RecessoEscolar[],
): ConflitoRecesso[] {
  const conflitos: ConflitoRecesso[] = []

  for (const aula of aulas) {
    if (aula.status !== 'Agendada') continue
    if (aula.escola_id === null) continue

    const recesso = recessos.find(
      (r) =>
        r.escola_id === aula.escola_id &&
        aula.data >= r.data_inicio &&
        aula.data <= r.data_fim,
    )

    if (recesso) {
      conflitos.push({ aulaId: aula.id, data: aula.data, recesso: recesso.descricao })
    }
  }

  return conflitos
}
