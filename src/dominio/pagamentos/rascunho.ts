import type { Centavos } from '@/dominio/dinheiro'

/**
 * Decisao 3 do Julio (28/10/2026): a conta a pagar do professor ganha
 * rascunho, como a cobranca. O rascunho nao reserva as presencas, entao nao
 * trava a aula: a chamada pode ser corrigida, o aviso cancelado, o professor
 * de uma aula trocado. So a conta confirmada trava.
 *
 * Por isso, ao confirmar, o fechamento e calculado de novo. Se nao bater com o
 * rascunho — mesmas aulas, mesmos valores —, o rascunho e refeito e a gestora
 * confere outra vez, em vez de confirmar algo diferente do que ela viu.
 */
export interface ItemDoRascunhoDePagamento {
  presenca_id: number | null
  pendencia_id: number | null
  valor_professor: Centavos
}

const chave = (i: ItemDoRascunhoDePagamento) =>
  `${i.presenca_id ?? ''}|${i.pendencia_id ?? ''}|${i.valor_professor}`

export function rascunhoBateComFechamento(
  rascunho: ItemDoRascunhoDePagamento[],
  fechamento: ItemDoRascunhoDePagamento[],
): boolean {
  if (rascunho.length !== fechamento.length) return false
  const vistos = new Set(rascunho.map(chave))
  return fechamento.every((i) => vistos.has(chave(i)))
}
