import type { Centavos } from '@/dominio/dinheiro'
import { destinoDaAulaNaoCobrada, type StatusCobranca } from '@/dominio/reposicoes/desfecho'

/** Um item de cobranca do aluno numa aula da turma de que ele saiu. */
export interface ItemDaSaida {
  id: number
  aula_id: number
  /** yyyy-mm-dd da referencia da aula: e por ela que a matricula vale. */
  data: string
  valor_final: Centavos
  cobranca_status: StatusCobranca
  /** A cobranca do item ja teve algum recebimento. */
  temRecebimento: boolean
  /** Ja gerou credito (pela saida ou por uma desistencia de reposicao). */
  jaVirouCredito: boolean
}

export interface AcertoDaSaida {
  /** Itens de cobranca sem nenhum pagamento: a aula so sai dela (opcao A). */
  tirar: number[]
  creditar: { item_id: number; aula_id: number; data: string; valor: Centavos }[]
}

/**
 * Decisao 11 do Julio (28/10/2026): o aluno que sai da turma com aulas ja
 * cobradas depois da saida fica com credito delas, com as mesmas saidas de
 * qualquer credito (abater ou devolver). E a regra da Rodada 3 para a aula
 * nao dada: rascunho nao e cobranca, entao o item so sai dele.
 *
 * Opcao A (13/11/2026): vale o mesmo que no aviso — enquanto a cobranca nao
 * teve pagamento nenhum (rascunho, confirmada ou enviada), a aula so sai dela.
 * Credito so quando ja entrou dinheiro. Regra em destinoDaAulaNaoCobrada.
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

  const destino = (i: ItemDaSaida) =>
    destinoDaAulaNaoCobrada(false, { status: i.cobranca_status, temRecebimento: i.temRecebimento })

  return {
    tirar: fora.filter((i) => destino(i) === 'tirar').map((i) => i.id),
    creditar: fora
      .filter((i) => destino(i) === 'credito' && i.valor_final > 0)
      .map((i) => ({ item_id: i.id, aula_id: i.aula_id, data: i.data, valor: i.valor_final })),
  }
}
