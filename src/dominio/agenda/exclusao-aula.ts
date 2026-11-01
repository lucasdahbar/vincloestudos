import { validarDecisao, type Decisao } from '@/dominio/reposicoes/desfecho'
import type { StatusAula } from '@/dominio/tipos'

/**
 * Rodada 4 (spec 6.2): excluir uma aula de uma turma.
 *
 * Aula que aconteceu (presença registrada) não sai. Sem alunos, basta
 * confirmar. Com alunos, cada um vai para reposição antes — pelas regras de
 * reposição de sempre, sem cobrança — ou fica sem reposição, com a decisão de
 * cobrança do "avisou que não vem".
 */
export interface AlunoNaAula {
  aluno_id: number
  nome: string
}

export interface SituacaoDaAula {
  status: StatusAula
  temPresenca: boolean
  /** Matrícula regular ativa cobrindo a data da aula. */
  regulares: AlunoNaAula[]
  /** Pendências Agendadas cujo destino é esta aula. */
  reposicoes: (AlunoNaAula & { pendencia_id: number })[]
  /** Alunos que já têm pendência com origem nesta aula (avisaram que não vinham). */
  comPendencia: number[]
}

export type AvaliacaoExclusaoAula =
  | { tipo: 'bloqueada'; motivo: string }
  | { tipo: 'sem-alunos' }
  | {
      tipo: 'com-alunos'
      regulares: AlunoNaAula[]
      reposicoes: (AlunoNaAula & { pendencia_id: number })[]
    }

export function avaliarExclusaoAula(s: SituacaoDaAula): AvaliacaoExclusaoAula {
  if (s.status === 'Excluída') return { tipo: 'bloqueada', motivo: 'Esta aula já foi excluída.' }
  if (s.status === 'Realizada' || s.temPresenca) {
    return {
      tipo: 'bloqueada',
      motivo: 'Esta aula já aconteceu: o professor registrou a presença. Ela não pode ser excluída.',
    }
  }

  // Quem repõe aqui é tratado pela pendência dele; quem já avisou já tem a
  // sua. Nenhum dos dois ganha uma segunda.
  const repondo = new Set(s.reposicoes.map((r) => r.aluno_id))
  const jaTem = new Set(s.comPendencia)
  const regulares = s.regulares.filter((a) => !repondo.has(a.aluno_id) && !jaTem.has(a.aluno_id))

  if (regulares.length === 0 && s.reposicoes.length === 0) return { tipo: 'sem-alunos' }
  return { tipo: 'com-alunos', regulares, reposicoes: s.reposicoes }
}

/**
 * `aula_destino_id` nulo = deixar a reposição pendente. `sem_reposicao` (pedido
 * do Julio, 01/11/2026) = não gerar reposição: a mesma decisão de cobrança do
 * "avisou que não vem" (cobrar a aula? pagar o professor?).
 */
export interface EscolhaRegular {
  aluno_id: number
  aula_destino_id: number | null
  sem_reposicao?: Decisao
}
export interface EscolhaReposicao {
  pendencia_id: number
  aula_destino_id: number | null
  sem_reposicao?: Decisao
}

export function validarEscolhas(
  av: Extract<AvaliacaoExclusaoAula, { tipo: 'com-alunos' }>,
  aulaId: number,
  regulares: EscolhaRegular[],
  reposicoes: EscolhaReposicao[],
): string[] {
  const erros: string[] = []

  const conferir = (
    nome: string,
    escolha: { aula_destino_id: number | null; sem_reposicao?: Decisao } | undefined,
  ) => {
    if (!escolha) erros.push(`Escolha o que fazer com ${nome}.`)
    else if (escolha.aula_destino_id === aulaId) {
      erros.push(`A reposição de ${nome} não pode ser na aula que está sendo excluída.`)
    } else if (escolha.sem_reposicao) {
      if (escolha.aula_destino_id !== null) {
        erros.push(`${nome} não pode ficar sem reposição e ter uma aula de reposição ao mesmo tempo.`)
      }
      for (const e of validarDecisao(escolha.sem_reposicao)) erros.push(`${nome}: ${e.charAt(0).toLowerCase()}${e.slice(1)}`)
    }
  }

  for (const a of av.regulares) conferir(a.nome, regulares.find((e) => e.aluno_id === a.aluno_id))
  for (const r of av.reposicoes) conferir(r.nome, reposicoes.find((e) => e.pendencia_id === r.pendencia_id))

  return erros
}
