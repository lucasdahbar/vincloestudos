import type { ProvedorAgenda, TurmaParaSincronizar } from './provedor'
import type { OcorrenciaAula } from '@/dominio/agenda/materializacao'

/**
 * Modulos Operacionais 4.3. Le as ocorrencias do evento recorrente vinculado a
 * turma (campo google_calendar_event_id) via Google Calendar API, com OAuth 2.0
 * autorizado uma unica vez pela gestora sobre a agenda compartilhada.
 *
 * Fica desligado ate GOOGLE_CALENDAR_ATIVO=true e as credenciais existirem.
 * A implementacao do fetch entra quando houver credencial para testar contra a
 * API real — escrever agora seria codigo nao verificavel.
 */
export const googleCalendar: ProvedorAgenda = {
  nome: 'google-calendar',
  async listarOcorrencias(
    turma: TurmaParaSincronizar,
    _de: string,
    _ate: string,
  ): Promise<OcorrenciaAula[]> {
    if (!turma.google_calendar_event_id) return []
    throw new Error(
      'Provedor Google Calendar ainda não implementado. ' +
        'Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET e mantenha ' +
        'GOOGLE_CALENDAR_ATIVO=false até a integração ser concluída.',
    )
  },
}
