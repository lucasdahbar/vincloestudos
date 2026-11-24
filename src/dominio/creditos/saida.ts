import type { Centavos } from '@/dominio/dinheiro'
import { creditoAoCancelarAviso, destinoDaAulaNaoCobrada, type StatusCobranca, type TipoUsoCredito } from '@/dominio/reposicoes/desfecho'

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

/** Um credito que nasceu da saida (ligado ao item de uma aula da turma). */
export interface CreditoDaAula {
  credito_id: number
  /** yyyy-mm-dd da referencia da aula do item. */
  data: string
  valor: Centavos
  usos: { tipo: TipoUsoCredito; valor: Centavos }[]
}

/**
 * Volta (Julio, 24/11/2026): o aluno saiu, a aula ja paga virou credito
 * (Decisao 11), e depois ele voltou para fazer essa aula — numa aula avulsa ou
 * numa matricula nova. A aula continua na cobranca paga, entao a geracao nao a
 * cobra de novo; sem este acerto a familia ficava com a aula E com o credito.
 *
 * Credito intacto: estornado e solto da aula, como no aviso cancelado (caso
 * Isabela). Solto, uma nova saida pode credita-la de novo.
 *
 * Credito ja usado (abatido ou devolvido, mesmo em parte): a regra do Julio e
 * cobrar a aula de novo, mas o item pago ainda ocupa a aula (um item por aula e
 * aluno), entao por ora a gestora e avisada e acerta com a familia.
 */
export function acertoDaVolta(
  creditos: CreditoDaAula[],
  periodos: { data_inicio: string; data_fim: string | null }[],
): {
  cancelar: { credito_id: number; data: string; estornar: Centavos }[]
  jaUsados: { credito_id: number; data: string }[]
} {
  const coberta = (d: string) => periodos.some((p) => d >= p.data_inicio && (p.data_fim === null || d <= p.data_fim))
  const voltaram = creditos.filter((c) => coberta(c.data))
  const situacao = (c: CreditoDaAula) => creditoAoCancelarAviso({ valor: c.valor, usos: c.usos })
  return {
    cancelar: voltaram
      .filter((c) => !situacao(c).usado)
      .map((c) => ({ credito_id: c.credito_id, data: c.data, estornar: situacao(c).estornar })),
    jaUsados: voltaram.filter((c) => situacao(c).usado).map((c) => ({ credito_id: c.credito_id, data: c.data })),
  }
}
