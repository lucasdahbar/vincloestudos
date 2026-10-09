import type { Frequencia, StatusTurma, TipoRecorrencia } from '@/dominio/tipos'
import { datasDaRegra } from './recorrencia'

export interface RecorrenciaTurma {
  id: number
  /** T1: 'Único' acontece uma vez so, em `data_unica`. */
  tipo_recorrencia?: TipoRecorrencia
  /** Data em ISO (AAAA-MM-DD). So no modo Único. */
  data_unica?: string | null
  /** Rodada 4. Ausente = Semanal, como as turmas de antes. */
  frequencia?: Frequencia | null
  /** Rodada 4: "a cada N". Ausente = 1. */
  intervalo?: number | null
  /** Mesmo indice de Date.getDay(): 0 = domingo. */
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: StatusTurma
  /**
   * Rodada 4: período da recorrência, em ISO. Substitui o "não gerar antes do
   * dia do cadastro" (22/09/2026): agora a gestora escolhe o início, inclusive
   * no passado. Ausente = sem limite naquela ponta.
   */
  data_inicio?: string | null
  data_fim?: string | null
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

/**
 * Expande a recorrencia da turma nas ocorrencias que caem no intervalo
 * [de, ate], inclusive nas duas pontas, menos as `puladas` (feriados e
 * recessos — ver `datas-puladas.ts`).
 *
 * Puro e deterministico de proposito: e a propriedade que garante que
 * ressincronizar a agenda nao cria aula duplicada.
 */
export function materializar(
  turma: RecorrenciaTurma,
  de: string,
  ate: string,
  puladas: ReadonlySet<string> = new Set(),
): OcorrenciaAula[] {
  if (turma.status !== 'Ativa') return []
  if (de > ate) return []

  const ocorrencia = (data: string): OcorrenciaAula => ({
    data,
    horario_inicio: turma.horario_inicio,
    horario_fim: turma.horario_fim,
    google_calendar_event_id: idOcorrenciaLocal(turma.id, data, turma.horario_inicio),
  })

  // T1: turma que nao se repete rende no maximo uma aula, e so se a data dela
  // cair na janela pedida. Nunca e pulada: a gestora escolheu a data sabendo
  // do feriado (spec 4.3).
  if (turma.tipo_recorrencia === 'Único') {
    if (!turma.data_unica) return []
    if (turma.data_unica < de || turma.data_unica > ate) return []
    return [ocorrencia(turma.data_unica)]
  }

  const frequencia = turma.frequencia ?? 'Semanal'
  if (frequencia === 'Semanal' && turma.dias_semana.length === 0) return []

  const datas = datasDaRegra(
    {
      frequencia,
      intervalo: turma.intervalo ?? 1,
      dias_semana: turma.dias_semana,
      data_inicio: turma.data_inicio ?? de,
      data_fim: turma.data_fim ?? ate,
    },
    de,
    ate,
  )

  return datas.filter((d) => !puladas.has(d)).map(ocorrencia)
}
