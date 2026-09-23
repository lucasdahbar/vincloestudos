import { recorrenciaLocal } from './recorrencia-local'
import type { ProvedorAgenda } from './provedor'

/**
 * De onde vêm as aulas do sistema: sempre da recorrência da própria turma.
 *
 * `GOOGLE_CALENDAR_ATIVO` não entra aqui. Ele liga a ESCRITA no Google (G2,
 * em `dados/evento-da-turma.ts`), não a leitura. Desde G2 é o sistema que cria
 * o evento a partir da turma; ler as aulas de volta do Google seria circular.
 *
 * Até 22/09/2026 a flag também trocava este provedor por um stub do Google que
 * lançava erro em toda turma com evento. A sincronização abortava, a agenda
 * engolia o erro e mostrava "0 aulas no mês" — desde o dia em que a
 * integração foi ligada.
 */
export function provedorAtivo(): ProvedorAgenda {
  return recorrenciaLocal
}

export type { ProvedorAgenda, TurmaParaSincronizar } from './provedor'
