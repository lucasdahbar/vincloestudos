import type { StatusCobranca } from './cancelamento'

/**
 * C1: a cobranca e "complementar" quando a familia ja recebeu outra do mesmo
 * mes valendo — o texto abre dizendo "aulas que nao entraram na cobranca
 * anterior".
 *
 * Bug de 09/11/2026: a marca era decidida ao criar o rascunho e contava
 * qualquer cobranca do mes, inclusive a cancelada. Cancelar para corrigir uma
 * aula e gerar de novo produzia um texto falando de uma "cobranca anterior"
 * que nao existe mais. Rascunho tambem nao conta: ainda nao foi mandado.
 *
 * `outras`: status das demais cobrancas do mesmo responsavel e mes.
 */
export function ehComplementar(outras: StatusCobranca[]): boolean {
  return outras.some((s) => s !== 'Rascunho' && s !== 'Cancelada')
}
