import type { OrigemAusencia } from '@/dominio/tipos'
import type { StatusReposicao } from '@/dominio/reposicoes/agendamento'

/**
 * Corrigir uma chamada já gravada (pedido do tio, 13/10/2026).
 *
 * Gravar a chamada de novo (o professor reenviando depois de a gestora
 * reabrir, ou a gestora corrigindo direto) só sabia somar: a presença era
 * regravada, mas a reposição que uma falta gerou continuava lá depois de a
 * falta virar presença. Esta função diz o que precisa ser desfeito, e se a
 * correção é possível.
 *
 * Só planeja; quem aplica é `dados/gravar-chamada.ts`.
 */
export interface PresencaAtual {
  aluno_id: number
  nome: string
  presente: boolean
  /** Pagamento do professor em que esta presença já entrou. */
  conta_pagar_id: number | null
}

/** Ausência registrada para o aluno NESTA aula (a aula é a de origem). */
export interface PendenciaDaAula {
  id: number
  aluno_id: number
  origem: OrigemAusencia
  status: StatusReposicao
  temCredito: boolean
  /** Já entrou no pagamento do professor como "desistência paga". */
  pagoAoProfessor: boolean
}

/** Reposição de um aluno que acontece NESTA aula (a aula é a de destino). */
export interface ReposicaoNaAula {
  id: number
  aluno_id: number
  status: StatusReposicao
}

export interface PlanoDaCorrecao {
  erros: string[]
  /** Reposições geradas por uma falta que deixou de existir. */
  removerPendencias: number[]
  /** Reposições dadas por concluídas que voltam a "marcada": o aluno faltou. */
  reabrirReposicoes: number[]
}

export function planejarCorrecao(entrada: {
  atuais: PresencaAtual[]
  novas: { aluno_id: number; presente: boolean }[]
  pendencias: PendenciaDaAula[]
  reposicoes: ReposicaoNaAula[]
}): PlanoDaCorrecao {
  const plano: PlanoDaCorrecao = { erros: [], removerPendencias: [], reabrirReposicoes: [] }
  const { atuais, novas, pendencias, reposicoes } = entrada

  // Pagamento fechado trava a aula inteira: corrigir uma presença mudaria o
  // que o professor recebeu.
  if (atuais.some((a) => a.conta_pagar_id !== null)) {
    plano.erros.push(
      'O pagamento do professor desta aula já foi fechado: não dá para corrigir a chamada.',
    )
    return plano
  }

  const antes = new Map(atuais.map((a) => [a.aluno_id, a]))

  for (const nova of novas) {
    const velha = antes.get(nova.aluno_id)
    if (!velha || velha.presente === nova.presente) continue

    if (nova.presente) {
      // Falta que virou presença: a reposição que ela gerou não tem mais razão
      // de existir — a menos que já tenha andado.
      const pendencia = pendencias.find((p) => p.aluno_id === nova.aluno_id && p.origem === 'Falta')
      if (!pendencia) continue

      const andou =
        pendencia.status !== 'Pendente' || pendencia.temCredito || pendencia.pagoAoProfessor
      if (andou) {
        plano.erros.push(
          `A falta de ${velha.nome} já teve reposição marcada ou decisão de cobrança: ` +
            'resolva isso em Reposições antes de corrigir a chamada.',
        )
      } else {
        plano.removerPendencias.push(pendencia.id)
      }
    } else {
      // Presença que virou falta, de quem estava ali repondo: a reposição não
      // aconteceu.
      for (const r of reposicoes) {
        if (r.aluno_id === nova.aluno_id && r.status === 'Realizada') {
          plano.reabrirReposicoes.push(r.id)
        }
      }
    }
  }

  return plano
}
