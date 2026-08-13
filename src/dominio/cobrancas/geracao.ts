import { somar, type Centavos } from '@/dominio/dinheiro'

export interface AulaFaturavel {
  aula_id: number
  aluno_id: number
  aluno_nome: string
  responsavel_id: number
  responsavel_nome: string
  /** Data da aula em ISO, AAAA-MM-DD. */
  data: string
  descricao: string
  /** Valor do servico VIGENTE NA DATA DA AULA, em centavos. */
  valor: Centavos
  status_aula: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
  matricula_ativa: boolean
  matricula_reposicao: boolean
  /** Ja presente em algum item de cobranca. */
  ja_cobrada: boolean
}

export interface ItemMontado {
  aula_id: number
  aluno_id: number
  aluno_nome: string
  data: string
  descricao: string
  valor_original: Centavos
  desconto: Centavos
  valor_final: Centavos
}

export interface CobrancaMontada {
  responsavel_id: number
  responsavel_nome: string
  itens: ItemMontado[]
  valor_bruto: Centavos
  valor_desconto: Centavos
  valor_total: Centavos
}

/**
 * Modulos Operacionais 6.3. A base de calculo sao as aulas previstas no mes,
 * de matriculas ativas e NAO marcadas como reposicao, que ainda nao entraram em
 * nenhum item de cobranca.
 *
 * Aula cancelada ou em feriado nao gera cobranca (RN 4.2). A reposicao tambem
 * nao: o aluno ja pagou pela aula original (RN 5.4).
 *
 * A exclusao de `ja_cobrada` e o que torna a geracao idempotente do lado da
 * aplicacao; do lado do banco, `UNIQUE(itens_cobranca.aula_id)` garante o mesmo
 * mesmo que dois processos rodem ao mesmo tempo.
 */
export function faturavel(aula: AulaFaturavel): boolean {
  return (
    aula.matricula_ativa &&
    !aula.matricula_reposicao &&
    !aula.ja_cobrada &&
    (aula.status_aula === 'Agendada' || aula.status_aula === 'Realizada')
  )
}

export function montarCobrancas(aulas: AulaFaturavel[]): CobrancaMontada[] {
  const porResponsavel = new Map<number, AulaFaturavel[]>()

  for (const aula of aulas.filter(faturavel)) {
    porResponsavel.set(aula.responsavel_id, [
      ...(porResponsavel.get(aula.responsavel_id) ?? []),
      aula,
    ])
  }

  return [...porResponsavel.entries()].map(([responsavelId, doResponsavel]) => {
    const itens: ItemMontado[] = doResponsavel
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((a) => ({
        aula_id: a.aula_id,
        aluno_id: a.aluno_id,
        aluno_nome: a.aluno_nome,
        data: a.data,
        descricao: a.descricao,
        valor_original: a.valor,
        desconto: 0,
        valor_final: a.valor,
      }))

    const valorBruto = somar(...itens.map((i) => i.valor_original))
    const valorDesconto = somar(...itens.map((i) => i.desconto))

    return {
      responsavel_id: responsavelId,
      responsavel_nome: doResponsavel[0].responsavel_nome,
      itens,
      valor_bruto: valorBruto,
      valor_desconto: valorDesconto,
      valor_total: valorBruto - valorDesconto,
    }
  })
}
