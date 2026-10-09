import { somar, type Centavos } from '@/dominio/dinheiro'
import type { OrigemAusencia, StatusAula } from '@/dominio/tipos'

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
  status_aula: StatusAula
  matricula_ativa: boolean
  matricula_reposicao: boolean
  /** Ja presente em algum item de cobranca. */
  ja_cobrada: boolean
  /**
   * Rodada 3: o aluno nao participou desta aula. `cobrar` e a decisao da
   * gestora quando a reposicao nao vai acontecer; nulo enquanto ela pode
   * acontecer.
   */
  ausencia?: { origem: OrigemAusencia; cobrar: boolean | null } | null
  /**
   * Rodada 3: esta aula e a reposicao de outra. Valor da aula original, na
   * data dela, para cobrar so a diferenca quando a turma de destino e mais cara.
   */
  reposicao_de?: { data: string; valor: Centavos } | null
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
    // Reposicao sem a aula de origem nao tem como calcular a diferenca.
    (!aula.matricula_reposicao || !!aula.reposicao_de) &&
    // Rodada 3: a gestora decidiu nao cobrar a aula que o aluno perdeu.
    aula.ausencia?.cobrar !== false &&
    !aula.ja_cobrada &&
    (aula.status_aula === 'Agendada' ||
      aula.status_aula === 'Realizada' ||
      // Rodada 4: a aula excluída segue cobrada de quem foi para reposição —
      // é o que faz a reposição entrar com zero (spec 3.3).
      (aula.status_aula === 'Excluída' && !!aula.ausencia))
  )
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Rodada 3: valor e descricao do item.
 *
 * A reposicao entra na cobranca com zero — o aluno ja pagou a aula original —
 * ou com a diferenca, quando a turma de destino e mais cara. A gestora pode
 * mudar depois, como qualquer item.
 *
 * As anotacoes usam parenteses, nao " — ": o texto da cobranca parte a
 * descricao nesse separador para montar a mensagem.
 */
function valorEDescricao(a: AulaFaturavel): { valor: Centavos; descricao: string } {
  if (a.reposicao_de) {
    return {
      valor: Math.max(0, a.valor - a.reposicao_de.valor),
      descricao: `${a.descricao} (reposição da aula de ${ddmm(a.reposicao_de.data)})`,
    }
  }
  if (a.ausencia?.origem === 'Exclusão') {
    return { valor: a.valor, descricao: `${a.descricao} (aula excluída, com reposição)` }
  }
  if (a.ausencia) {
    const motivo = a.ausencia.origem === 'Aviso' ? 'avisou que não vem' : 'faltou'
    return { valor: a.valor, descricao: `${a.descricao} (não participou: ${motivo})` }
  }
  return { valor: a.valor, descricao: a.descricao }
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
      .map((a) => {
        const { valor, descricao } = valorEDescricao(a)
        return {
          aula_id: a.aula_id,
          aluno_id: a.aluno_id,
          aluno_nome: a.aluno_nome,
          data: a.data,
          descricao,
          valor_original: valor,
          desconto: 0,
          valor_final: valor,
        }
      })

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
