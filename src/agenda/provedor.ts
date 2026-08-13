import type { OcorrenciaAula, RecorrenciaTurma } from '@/dominio/agenda/materializacao'

export interface TurmaParaSincronizar extends RecorrenciaTurma {
  google_calendar_event_id: string | null
  modalidade: 'Presencial' | 'Online'
}

export interface ProvedorAgenda {
  readonly nome: string
  /**
   * Ocorrencias da turma no intervalo [de, ate], datas em ISO.
   * Cada ocorrencia carrega um `google_calendar_event_id` estavel: e a chave
   * de idempotencia do upsert, e o que garante que ressincronizar nao duplica.
   */
  listarOcorrencias(
    turma: TurmaParaSincronizar,
    de: string,
    ate: string,
  ): Promise<OcorrenciaAula[]>
}
