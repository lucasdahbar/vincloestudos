import type { Centavos } from '@/dominio/dinheiro'
import type { StatusCobranca } from '@/dominio/reposicoes/desfecho'

/** Um item de cobranca do aluno numa aula da turma de que ele saiu. */
export interface ItemDaSaida {
  id: number
  aula_id: number
  /** yyyy-mm-dd da referencia da aula: e por ela que a matricula vale. */
  data: string
  valor_final: Centavos
  cobranca_status: StatusCobranca
  /** Ja gerou credito (pela saida ou por uma desistencia de reposicao). */
  jaVirouCredito: boolean
}

export interface AcertoDaSaida {
  /** Itens em rascunho: a aula ainda nao foi cobrada de ninguem, so sai. */
  tirarDoRascunho: number[]
  creditar: { item_id: number; aula_id: number; data: string; valor: Centavos }[]
}

/**
 * Decisao 11 do Julio (28/10/2026): o aluno que sai da turma com aulas ja
 * cobradas depois da saida fica com credito delas, com as mesmas saidas de
 * qualquer credito (abater ou devolver). E a regra da Rodada 3 para a aula
 * nao dada: rascunho nao e cobranca, entao o item so sai dele.
 *
 * `periodos` sao as matriculas que sobraram do aluno na turma: a aula coberta
 * por qualquer uma delas continua dele.
 */
export function acertoDaSaida(
  itens: ItemDaSaida[],
  periodos: { data_inicio: string; data_fim: string | null }[],
): AcertoDaSaida {
  const coberta = (d: string) => periodos.some((p) => d >= p.data_inicio && (p.data_fim === null || d <= p.data_fim))
  const fora = itens.filter((i) => !coberta(i.data) && !i.jaVirouCredito)

  return {
    tirarDoRascunho: fora.filter((i) => i.cobranca_status === 'Rascunho').map((i) => i.id),
    creditar: fora
      .filter((i) => i.cobranca_status !== 'Rascunho' && i.cobranca_status !== 'Cancelada' && i.valor_final > 0)
      .map((i) => ({ item_id: i.id, aula_id: i.aula_id, data: i.data, valor: i.valor_final })),
  }
}
