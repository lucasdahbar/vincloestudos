import { somar, type Centavos } from '@/dominio/dinheiro'
import type { DesistenciaPaga, PresencaRemunerada } from './fechamento'

/**
 * A base do pagamento do professor é o que foi efetivamente cobrado (pedido do
 * tio, 13/10/2026).
 *
 * Antes era o valor do serviço no cadastro. Mas ao fechar a cobrança dos
 * responsáveis a gestora ajusta valores e dá descontos, e é esse valor — o da
 * aula como ela foi cobrada — que o percentual do professor deve incidir. Só
 * entra no pagamento a aula com presença confirmada E cobrança confirmada; a
 * que ainda não tem cobrança confirmada aparece à parte, como lembrete para a
 * gestora fechar a cobrança, e não soma no total.
 */
export type SituacaoDaCobranca = 'confirmada' | 'rascunho' | 'nenhuma'

/** Um item de cobrança que compõe o que o responsável pagou por esta aula. */
export interface ParteCobrada {
  situacao: SituacaoDaCobranca
  /** Valor final do item (já com o desconto), em centavos. */
  valor: Centavos
}

export interface CandidataAoPagamento {
  /** Um dos dois: presença confirmada ou desistência paga. */
  presenca_id: number | null
  pendencia_id: number | null
  desistencia: boolean
  aluno_id: number
  aluno_nome: string
  turma_id: number
  turma_nome: string
  data_aula: string
  flag_reposicao: boolean
  /** Percentual do professor vigente na data da aula. */
  percentual: number
  /**
   * O que foi cobrado por esta aula. Aula comum e desistência paga: o item
   * dela. Reposição: o item da aula original MAIS o da reposição (a diferença
   * de valor, quando a turma de destino é mais cara; R$ 0,00 quando não é) —
   * por isso o professor da reposição não recebe zero. Sem item conhecido,
   * lista vazia.
   */
  cobrancas: ParteCobrada[]
}

export interface AulaAguardando {
  aluno_nome: string
  turma_nome: string
  data_aula: string
  desistencia: boolean
  motivo: string
}

export interface ClassificacaoPelaCobranca {
  pagaveis: PresencaRemunerada[]
  desistencias: DesistenciaPaga[]
  aguardando: AulaAguardando[]
}

/** O pior estado entre as partes: faltar cobrança pesa mais que estar em rascunho. */
function situacaoDe(partes: ParteCobrada[]): SituacaoDaCobranca {
  if (partes.length === 0 || partes.some((p) => p.situacao === 'nenhuma')) return 'nenhuma'
  if (partes.some((p) => p.situacao === 'rascunho')) return 'rascunho'
  return 'confirmada'
}

const MOTIVO = {
  rascunho: 'A cobrança desta aula ainda está em rascunho.',
  nenhuma: 'Esta aula ainda não foi cobrada.',
} as const

export function classificarPelaCobranca(
  candidatas: CandidataAoPagamento[],
): ClassificacaoPelaCobranca {
  const pagaveis: PresencaRemunerada[] = []
  const desistencias: DesistenciaPaga[] = []
  const aguardando: AulaAguardando[] = []

  for (const c of candidatas) {
    const situacao = situacaoDe(c.cobrancas)

    if (situacao !== 'confirmada') {
      aguardando.push({
        aluno_nome: c.aluno_nome,
        turma_nome: c.turma_nome,
        data_aula: c.data_aula,
        desistencia: c.desistencia,
        motivo: MOTIVO[situacao],
      })
      continue
    }

    const valor = somar(...c.cobrancas.map((p) => p.valor))

    if (c.desistencia) {
      desistencias.push({
        pendencia_id: c.pendencia_id!,
        aluno_id: c.aluno_id,
        aluno_nome: c.aluno_nome,
        turma_id: c.turma_id,
        turma_nome: c.turma_nome,
        data_aula: c.data_aula,
        valor_servico: valor,
        percentual: c.percentual,
        ja_paga: false,
      })
    } else {
      pagaveis.push({
        presenca_id: c.presenca_id!,
        aluno_id: c.aluno_id,
        aluno_nome: c.aluno_nome,
        turma_id: c.turma_id,
        turma_nome: c.turma_nome,
        data_aula: c.data_aula,
        presente: true,
        flag_reposicao: c.flag_reposicao,
        valor_servico: valor,
        percentual: c.percentual,
        ja_paga: false,
      })
    }
  }

  aguardando.sort((a, b) => a.data_aula.localeCompare(b.data_aula))

  return { pagaveis, desistencias, aguardando }
}
