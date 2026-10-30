import type { StatusContaPagar } from '@/dominio/cobrancas/cancelamento'
import type { StatusAula } from '@/dominio/tipos'
import type { StatusCobranca } from '@/dominio/reposicoes/desfecho'

/**
 * Etapa 3 de "turmas como agenda" (28/10/2026): a situacao da aula, calculada
 * do que ja esta registrado. Nao e gravada: muda sozinha quando a chamada, a
 * cobranca ou o pagamento mudam.
 *
 * As 8 situacoes do Julio andam em tres trilhas paralelas (a cobranca do mes
 * sai antes da aula acontecer): a da aula (Criada, Confirmada, Aguardando
 * chamada, Realizada), a da cobranca (Em cobranca, Recebida) e a do
 * pagamento (Em pagamento, Paga). Concluida fecha as tres.
 */

export type SituacaoPrincipal =
  | 'Criada'
  | 'Confirmada'
  | 'Aguardando chamada'
  | 'Realizada'
  | 'Concluída'
  | 'Excluída'
  | 'Cancelada'
  | 'Feriado'

export interface FatosDaAula {
  status: StatusAula
  /** Fim da aula, AAAA-MM-DDTHH:MM no relogio da escola. */
  fim: string
  agora: string
  /** Quem esta na lista da aula: matricula, avulso ou reposicao na data. */
  alunos: number
  /** Tem presenca ou falta registrada. */
  chamadaFeita: boolean
  /** A cobranca de cada item da aula (um por aluno cobrado). */
  cobrancas: StatusCobranca[]
  /** Para cada presenca: o status da conta a pagar em que entrou, ou null. */
  /** Status da conta que reservou cada presenca (rascunho nao reserva). */
  pagamentos: (StatusContaPagar | null)[]
}

export interface SituacaoDaAula {
  principal: SituacaoPrincipal
  cobranca: 'Em cobrança' | 'Recebida' | null
  pagamento: 'Em pagamento' | 'Paga' | null
}

// Decisao 2: basta um recebimento. Cobranca com recebimento fica Parcial ou Quitada.
const RECEBIDA: StatusCobranca[] = ['Parcial', 'Quitada']
// Rascunho nao conta: ainda nao foi para o responsavel.
const EM_COBRANCA: StatusCobranca[] = ['Confirmada', 'Enviada']

export function situacaoDaAula(f: FatosDaAula): SituacaoDaAula {
  // Decisao 1: nas trilhas, vale o aluno mais avancado.
  const cobranca = f.cobrancas.some((c) => RECEBIDA.includes(c))
    ? 'Recebida'
    : f.cobrancas.some((c) => EM_COBRANCA.includes(c))
      ? 'Em cobrança'
      : null
  // Parcial ja teve dinheiro saindo e ainda deve: segue Em pagamento (revisao
  // de 30/10/2026 — antes so Pendente contava, e a aula ficava destravada).
  const pagamento = f.pagamentos.includes('Pago')
    ? 'Paga'
    : f.pagamentos.some((p) => p === 'Pendente' || p === 'Parcial')
      ? 'Em pagamento'
      : null

  if (f.status === 'Excluída' || f.status === 'Cancelada' || f.status === 'Feriado') {
    return { principal: f.status, cobranca, pagamento }
  }

  const realizada = f.status === 'Realizada' || f.chamadaFeita
  if (realizada) {
    // Concluida e "nada mais em aberto": todo aluno pagou por inteiro e toda
    // presenca entrou num pagamento ja feito ao professor.
    const tudoRecebido = f.cobrancas.length > 0 && f.cobrancas.every((c) => c === 'Quitada' || c === 'Cancelada') && f.cobrancas.includes('Quitada')
    const tudoPago = f.pagamentos.length > 0 && f.pagamentos.every((p) => p === 'Pago')
    return { principal: tudoRecebido && tudoPago ? 'Concluída' : 'Realizada', cobranca, pagamento }
  }

  if (f.alunos === 0) return { principal: 'Criada', cobranca, pagamento }
  // O professor pode ter esquecido a chamada: a aula nao e mais "confirmada"
  // (decisao 5), e o sistema pergunta antes de mexer nela.
  if (f.fim <= f.agora) return { principal: 'Aguardando chamada', cobranca, pagamento }
  return { principal: 'Confirmada', cobranca, pagamento }
}
