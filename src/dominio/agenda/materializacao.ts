import type { StatusTurma } from '@/dominio/tipos'

export interface RecorrenciaTurma {
  id: number
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
  if (turma.dias_semana.length === 0) return []
  if (de > ate) return []

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
