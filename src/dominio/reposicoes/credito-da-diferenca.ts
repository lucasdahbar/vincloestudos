import type { Centavos } from '@/dominio/dinheiro'

/**
 * Reposicao em turma mais barata (Julio, 24/11/2026). Ate aqui a reposicao
 * entrava a R$ 0,00 e a familia pagava a aula original inteira, mesmo repondo
 * numa aula que custa menos. Agora a Kelly decide ao marcar se a diferenca
 * volta como credito (ja marcado sim, como na troca de servico), e o credito
 * so nasce quando o aluno de fato faz a reposicao: presenca registrada. Se a
 * reposicao e desmarcada ou ele falta, nao fica credito sobrando.
 *
 * A reposicao mais cara continua como era: a diferenca entra na cobranca da
 * propria reposicao (Rodada 3, geracao.ts).
 */

export function diferencaDaReposicao(valorOrigem: Centavos, valorDestino: Centavos): Centavos {
  return Math.max(0, valorOrigem - valorDestino)
}

/**
 * O que gravar na pendencia ao marcar. Nulo: o destino nao e mais barato, nao
 * ha o que decidir. Sem resposta vale o sim.
 */
export function decisaoAoMarcar(diferenca: Centavos, resposta: boolean | undefined): boolean | null {
  if (diferenca <= 0) return null
  return resposta !== false
}

/** Quanto creditar quando a presenca na reposicao e registrada (0 = nada). */
export function creditoAoRealizar(p: {
  decisao: boolean | null
  jaTemCredito: boolean
  valorOrigem: Centavos
  valorDestino: Centavos
}): Centavos {
  if (p.decisao !== true || p.jaTemCredito) return 0
  return diferencaDaReposicao(p.valorOrigem, p.valorDestino)
}
