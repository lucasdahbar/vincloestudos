import { googleCalendar } from './google-calendar'
import { recorrenciaLocal } from './recorrencia-local'
import type { ProvedorAgenda } from './provedor'

export function provedorAtivo(): ProvedorAgenda {
  return process.env.GOOGLE_CALENDAR_ATIVO === 'true' ? googleCalendar : recorrenciaLocal
}

export type { ProvedorAgenda, TurmaParaSincronizar } from './provedor'
