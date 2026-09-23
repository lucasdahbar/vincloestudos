import { materializar } from '@/dominio/agenda/materializacao'
import type { ProvedorAgenda, TurmaParaSincronizar } from './provedor'

/**
 * Deriva as ocorrencias dos dias_semana e horarios da propria turma.
 * Nao depende de credencial nenhuma, e e o unico provedor: vale com o Google
 * ligado ou desligado (ver `provedorAtivo`, em ./index).
 */
export const recorrenciaLocal: ProvedorAgenda = {
  nome: 'recorrencia-local',
  async listarOcorrencias(turma: TurmaParaSincronizar, de: string, ate: string) {
    return materializar(turma, de, ate)
  },
}
