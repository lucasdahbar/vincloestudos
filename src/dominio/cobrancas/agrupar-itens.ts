/**
 * Itens da cobranca agrupados para conferencia (pedido do Julio, 15/11/2026):
 * por aluno, depois por materia (a descricao "Materia — Ano — Servico"), em
 * ordem de data, com subtotal. Vale em todos os status da cobranca.
 */
export interface ItemAgrupavel {
  aluno_nome: string
  descricao: string
  data: string
  valor_final: number
}

export interface GrupoDeMateria<I> {
  descricao: string
  itens: I[]
  subtotal: number
}

export interface GrupoDeAluno<I> {
  aluno: string
  grupos: GrupoDeMateria<I>[]
  total: number
}

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

export function agruparItens<I extends ItemAgrupavel>(itens: I[]): GrupoDeAluno<I>[] {
  const alunos = new Map<string, Map<string, I[]>>()
  for (const i of itens) {
    const materias = alunos.get(i.aluno_nome) ?? new Map<string, I[]>()
    materias.set(i.descricao, [...(materias.get(i.descricao) ?? []), i])
    alunos.set(i.aluno_nome, materias)
  }

  return [...alunos.entries()]
    .sort(([a], [b]) => porNome(a, b))
    .map(([aluno, materias]) => {
      const grupos = [...materias.entries()]
        .sort(([a], [b]) => porNome(a, b))
        .map(([descricao, lista]) => ({
          descricao,
          itens: [...lista].sort((x, y) => x.data.localeCompare(y.data)),
          subtotal: lista.reduce((s, x) => s + x.valor_final, 0),
        }))
      return { aluno, grupos, total: grupos.reduce((s, g) => s + g.subtotal, 0) }
    })
}
