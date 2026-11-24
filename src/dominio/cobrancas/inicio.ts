import type { StatusCobranca } from './cancelamento'

/**
 * Outubro de 2026 foi cobrado fora do sistema (pedido do Julio, 03/11/2026).
 * As cobrancas dele deviam ter sido apagadas naquele dia, mas 101 rascunhos
 * ficaram e apareciam para abater credito (Julio, 24/11/2026). Sem trava, o
 * "Gerar cobrancas" de outubro os criava de novo.
 */
export const INICIO_DA_COBRANCA_NO_SISTEMA = '2026-11-01'

/** `mes` em AAAA-MM. */
export function mesCobravel(mes: string): boolean {
  return `${mes}-01` >= INICIO_DA_COBRANCA_NO_SISTEMA
}

/**
 * Onde cabe abater um credito (Julio, 24/11/2026). Rascunho nao: ele e refeito
 * a cada geracao e ainda nao foi mandado. `mesReferencia` em AAAA-MM-DD.
 */
export function abateCredito(status: StatusCobranca, mesReferencia: string): boolean {
  return (
    (status === 'Confirmada' || status === 'Enviada' || status === 'Parcial') &&
    mesReferencia >= INICIO_DA_COBRANCA_NO_SISTEMA
  )
}
