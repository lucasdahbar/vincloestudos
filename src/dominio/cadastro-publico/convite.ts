/**
 * Convite de cadastro pelo proprio responsavel (pedido do Julio, 17/10/2026).
 *
 * A gestora gera um link por familia. Ele vale uma vez e por poucos dias: se
 * for repassado num grupo de WhatsApp, quem pegar depois nao consegue usar, e
 * um link esquecido nao fica aberto para sempre. Decisao de 18/10/2026: 7 dias.
 */
export const DIAS_DE_VALIDADE = 7

export type SituacaoConvite = 'valido' | 'usado' | 'expirado' | 'cancelado'

export interface EstadoConvite {
  expira_em: string
  usado_em: string | null
  cancelado_em: string | null
}

export function validadeDoConvite(criadoEm: Date): Date {
  return new Date(criadoEm.getTime() + DIAS_DE_VALIDADE * 24 * 60 * 60 * 1000)
}

export function situacaoDoConvite(c: EstadoConvite, agora: Date): SituacaoConvite {
  // O uso vem primeiro: quem ja enviou deve ver "recebemos seus dados", e nao
  // "link expirado", se abrir o link de novo dias depois.
  if (c.usado_em) return 'usado'
  if (c.cancelado_em) return 'cancelado'
  if (agora.getTime() > new Date(c.expira_em).getTime()) return 'expirado'
  return 'valido'
}

/** Texto da tela publica para cada link que nao pode mais ser usado. */
export const MOTIVO_INDISPONIVEL: Record<Exclude<SituacaoConvite, 'valido'>, string> = {
  usado: 'Recebemos seus dados por este link. Se precisar corrigir algo, fale com a escola.',
  expirado: 'Este link expirou. Peça um novo à escola.',
  cancelado: 'Este link foi cancelado. Peça um novo à escola.',
}
