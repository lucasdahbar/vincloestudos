/**
 * Decisao 6 do Julio (28/10/2026): a aula ja cobrada que foi para outro mes
 * continua cobrada no mes original. Na cobranca do mes novo ela aparece a
 * R$ 0,00, com o aviso "cobrada em <mes>, era <dia> as <hora>", para o
 * responsavel nao estranhar a aula a mais nem pagar duas vezes.
 *
 * Nao e um item: a aula ja tem o seu (um por aula e aluno). E so a linha que
 * a tela e o texto mostram.
 */
export interface ItemCobradoAntes {
  aluno_nome: string
  descricao: string
  /** Primeiro dia do mes da cobranca onde o item esta. */
  mes_cobranca: string
  /** Dia e hora da aula hoje, AAAA-MM-DDTHH:MM. */
  data_atual: string
  /** Dia e hora da aula quando foi cobrada. */
  data_cobrada: string
}

export interface LinhaCobradaAntes {
  aluno_nome: string
  descricao: string
  data: string
  nota: string
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function cobradasEmOutroMes(itens: ItemCobradoAntes[], mes: string): LinhaCobradaAntes[] {
  const doMes = mes.slice(0, 7)
  return itens
    .filter((i) => i.data_atual.slice(0, 7) === doMes && i.mes_cobranca.slice(0, 7) !== doMes)
    .sort((a, b) => a.data_atual.localeCompare(b.data_atual))
    .map((i) => ({
      aluno_nome: i.aluno_nome,
      descricao: i.descricao,
      data: i.data_atual.slice(0, 10),
      nota: `cobrada em ${MESES[Number(i.mes_cobranca.slice(5, 7)) - 1]}, era ${i.data_cobrada.slice(8, 10)}/${i.data_cobrada.slice(5, 7)} às ${i.data_cobrada.slice(11, 16)}`,
    }))
}
