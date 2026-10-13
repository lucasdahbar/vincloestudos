import type { Centavos } from '@/dominio/dinheiro'
import type { ItemMontado } from './geracao'

/**
 * Refazer o rascunho a cada "Gerar cobranças" (pedido do tio, 14/10/2026).
 *
 * Antes, gerar de novo só acrescentava as aulas que faltavam: o que já estava
 * no rascunho nunca era revisto, e continuava lá mesmo depois de o aluno ser
 * desmatriculado, a aula ser cancelada ou a gestora decidir não cobrar. Agora
 * o rascunho acompanha o que o mês pede neste momento.
 *
 * Esta função só planeja; quem aplica, numa transação, é a função
 * `aplicar_plano_rascunho` no banco. Cobrança confirmada nunca entra aqui.
 */
export interface ItemDoRascunho {
  id: number
  aula_id: number
  aluno_id: number
  descricao: string
  valor_original: Centavos
  desconto: Centavos
}

export interface PlanoDoRascunho {
  /** Ids dos itens que deixaram de valer. */
  apagar: number[]
  atualizar: {
    id: number
    descricao: string
    valor_original: Centavos
    desconto: Centavos
    valor_final: Centavos
  }[]
  inserir: ItemMontado[]
}

/** Por aula E aluno: numa turma em grupo, o colega é outro item. */
const chave = (aulaId: number, alunoId: number) => `${aulaId}:${alunoId}`

/**
 * Compara o que está no rascunho com o que a montagem devolve agora.
 *
 * O desconto digitado à mão é da gestora e sobrevive: só é limitado ao novo
 * valor da aula, para nunca passar dele. O item excluído à mão volta na
 * próxima geração (decisão do tio, 14/10/2026) — quem não quer cobrar uma aula
 * usa o "não cobrar", que a montagem respeita.
 */
export function planejarRascunho(
  existentes: ItemDoRascunho[],
  montados: ItemMontado[],
): PlanoDoRascunho {
  const devidos = new Map(montados.map((m) => [chave(m.aula_id, m.aluno_id), m]))
  const jaNoRascunho = new Set(existentes.map((e) => chave(e.aula_id, e.aluno_id)))

  const apagar: number[] = []
  const atualizar: PlanoDoRascunho['atualizar'] = []

  for (const e of existentes) {
    const devido = devidos.get(chave(e.aula_id, e.aluno_id))
    if (!devido) {
      apagar.push(e.id)
      continue
    }

    const desconto = Math.min(e.desconto, devido.valor_original)
    const mudou =
      devido.valor_original !== e.valor_original ||
      devido.descricao !== e.descricao ||
      desconto !== e.desconto
    if (mudou) {
      atualizar.push({
        id: e.id,
        descricao: devido.descricao,
        valor_original: devido.valor_original,
        desconto,
        valor_final: devido.valor_original - desconto,
      })
    }
  }

  const inserir = montados.filter((m) => !jaNoRascunho.has(chave(m.aula_id, m.aluno_id)))

  return { apagar, atualizar, inserir }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** O que a tela diz depois de gerar: só o que mudou. */
export function resumoDaGeracao(r: {
  criadas: number
  adicionados: number
  removidos: number
  atualizados: number
}): string {
  const partes = [
    r.criadas > 0 && plural(r.criadas, 'cobrança criada', 'cobranças criadas'),
    r.adicionados > 0 && plural(r.adicionados, 'aula adicionada', 'aulas adicionadas'),
    r.removidos > 0 && plural(r.removidos, 'aula removida', 'aulas removidas'),
    r.atualizados > 0 && plural(r.atualizados, 'aula atualizada', 'aulas atualizadas'),
  ].filter((p): p is string => Boolean(p))

  return partes.length > 0
    ? `${partes.join(', ')}.`
    : 'Nada mudou: os rascunhos já estavam em dia. Cobranças confirmadas não são alteradas.'
}
