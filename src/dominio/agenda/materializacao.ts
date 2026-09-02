import type { StatusTurma, TipoRecorrencia } from '@/dominio/tipos'

export interface RecorrenciaTurma {
  id: number
  /** T1: 'Único' acontece uma vez so, em `data_unica`. */
  tipo_recorrencia?: TipoRecorrencia
  /** Data em ISO (AAAA-MM-DD). So no modo Único. */
  data_unica?: string | null
  /** Mesmo indice de Date.getDay(): 0 = domingo. */
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: StatusTurma
}

export interface OcorrenciaAula {
  /** Data em ISO, AAAA-MM-DD. */
  data: string
  horario_inicio: string
  horario_fim: string
  /**
   * Chave de idempotencia. Ressincronizar gera exatamente os mesmos ids, entao
   * o upsert por esta coluna nunca duplica aula. O prefixo `local:` distingue
   * do id que o Google Calendar devolve.
   */
  google_calendar_event_id: string
}

export function idOcorrenciaLocal(turmaId: number, data: string, horario: string): string {
  return `local:t${turmaId}:${data}T${horario}`
}

/** Datas em ISO (AAAA-MM-DD) para evitar fuso horario na aritmetica de dias. */
function paraUTC(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Expande a recorrencia da turma nas ocorrencias que caem no intervalo
 * [de, ate], inclusive nas duas pontas.
 *
 * Puro e deterministico de proposito: e a propriedade que garante que
 * ressincronizar a agenda nao cria aula duplicada.
 */
export function materializar(
  turma: RecorrenciaTurma,
  de: string,
  ate: string,
): OcorrenciaAula[] {
  if (turma.status !== 'Ativa') return []
  if (de > ate) return []

  // T1: turma que nao se repete rende no maximo uma aula, e so se a data dela
  // cair na janela pedida.
  if (turma.tipo_recorrencia === 'Único') {
    if (!turma.data_unica) return []
    if (turma.data_unica < de || turma.data_unica > ate) return []
    return [
      {
        data: turma.data_unica,
        horario_inicio: turma.horario_inicio,
        horario_fim: turma.horario_fim,
        google_calendar_event_id: idOcorrenciaLocal(
          turma.id,
          turma.data_unica,
          turma.horario_inicio,
        ),
      },
    ]
  }

  if (turma.dias_semana.length === 0) return []

  const dias = new Set(turma.dias_semana)
  const ocorrencias: OcorrenciaAula[] = []
  const fim = paraUTC(ate)

  for (let d = paraUTC(de); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!dias.has(d.getUTCDay())) continue
    const data = paraISO(d)
    ocorrencias.push({
      data,
      horario_inicio: turma.horario_inicio,
      horario_fim: turma.horario_fim,
      google_calendar_event_id: idOcorrenciaLocal(turma.id, data, turma.horario_inicio),
    })
  }

  return ocorrencias
}
