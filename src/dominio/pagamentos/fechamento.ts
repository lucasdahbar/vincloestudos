import { aplicarPercentual, somar, type Centavos } from '@/dominio/dinheiro'

export interface PresencaRemunerada {
  presenca_id: number
  aluno_id: number
  aluno_nome: string
  turma_id: number
  turma_nome: string
  data_aula: string
  presente: boolean
  flag_reposicao: boolean
  /** Valor do servico VIGENTE NA DATA DA AULA, em centavos. */
  valor_servico: Centavos
  /** Percentual do professor VIGENTE NA DATA DA AULA. Ex.: 60 para 60%. */
  percentual: number
  /** Ja incluida em outro fechamento. */
  ja_paga: boolean
}

export interface ItemFechamento {
  presenca_id: number
  aluno_id: number
  aluno_nome: string
  turma_id: number
  turma_nome: string
  data_aula: string
  valor_servico: Centavos
  percentual_aplicado: number
  valor_professor: Centavos
}

export interface Fechamento {
  itens: ItemFechamento[]
  valor_total: Centavos
}

/**
 * Modulos Operacionais 8.2. O pagamento e baseado exclusivamente em presencas
 * confirmadas: aula sem registro ou marcada como ausencia nao gera valor.
 *
 * Presenca em aula de reposicao conta normalmente para o professor que a
 * ministrou, mesmo que a reposicao tenha ocorrido em turma diferente da
 * original (RN 5.4).
 *
 * Valor e percentual chegam ja resolvidos para a data da aula: mudanca posterior
 * de preco ou de repasse nao reescreve o que ja foi fechado.
 */
export function calcularFechamento(presencas: PresencaRemunerada[]): Fechamento {
  const itens: ItemFechamento[] = presencas
    .filter((p) => p.presente && !p.ja_paga)
    .slice()
    .sort((a, b) => a.data_aula.localeCompare(b.data_aula))
    .map((p) => ({
      presenca_id: p.presenca_id,
      aluno_id: p.aluno_id,
      aluno_nome: p.aluno_nome,
      turma_id: p.turma_id,
      turma_nome: p.turma_nome,
      data_aula: p.data_aula,
      valor_servico: p.valor_servico,
      percentual_aplicado: p.percentual,
      valor_professor: aplicarPercentual(p.valor_servico, p.percentual),
    }))

  return { itens, valor_total: somar(...itens.map((i) => i.valor_professor)) }
}
