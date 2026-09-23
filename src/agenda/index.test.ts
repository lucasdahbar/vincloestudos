import { afterEach, describe, expect, it, vi } from 'vitest'
import { provedorAtivo, type TurmaParaSincronizar } from './index'

/**
 * As aulas do sistema vêm da recorrência da própria turma, com ou sem o
 * Google ligado. Desde G2 é o sistema que cria o evento no Google a partir da
 * turma — ler as aulas de volta de lá seria circular.
 *
 * Regressão: com GOOGLE_CALENDAR_ATIVO=true o provedor trocava para um stub do
 * Google que lançava erro em toda turma com evento. A sincronização abortava,
 * a agenda engolia o erro e mostrava "0 aulas no mês".
 */
const aulao: TurmaParaSincronizar = {
  id: 26,
  tipo_recorrencia: 'Único',
  data_unica: '2026-09-28',
  dias_semana: [],
  horario_inicio: '08:00',
  horario_fim: '09:00',
  status: 'Ativa',
  google_calendar_event_id: '00dr3fkhpqqa9rg6ukc56s2h48',
  modalidade: 'Online',
}

describe('provedorAtivo', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['true', 'false'])(
    'com GOOGLE_CALENDAR_ATIVO=%s, materializa a aula da turma que já tem evento no Google',
    async (ativo) => {
      vi.stubEnv('GOOGLE_CALENDAR_ATIVO', ativo)

      const ocorrencias = await provedorAtivo().listarOcorrencias(
        aulao,
        '2026-09-01',
        '2026-09-30',
      )

      expect(ocorrencias).toHaveLength(1)
      expect(ocorrencias[0]).toMatchObject({
        data: '2026-09-28',
        horario_inicio: '08:00',
        horario_fim: '09:00',
      })
    },
  )
})
