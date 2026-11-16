import { describe, expect, it } from 'vitest'
import { agruparItens } from './agrupar-itens'

const item = (id: number, aluno_nome: string, descricao: string, data: string, valor_final = 100) => ({
  id,
  aluno_nome,
  descricao,
  data,
  valor_final,
})

describe('agruparItens', () => {
  it('agrupa por aluno e materia, em ordem de data, com subtotal', () => {
    const r = agruparItens([
      item(1, 'Bia', 'Matemática — 7º ano — Grupo', '2031-03-17'),
      item(2, 'Ana', 'Química', '2031-03-05'),
      item(3, 'Bia', 'Matemática — 7º ano — Grupo', '2031-03-03', 50),
      item(4, 'Bia', 'Física', '2031-03-10'),
    ])

    expect(r.map((a) => a.aluno)).toEqual(['Ana', 'Bia'])
    const bia = r[1]
    expect(bia.grupos.map((g) => g.descricao)).toEqual(['Física', 'Matemática — 7º ano — Grupo'])
    expect(bia.grupos[1].itens.map((i) => i.id)).toEqual([3, 1])
    expect(bia.grupos[1].subtotal).toBe(150)
    expect(bia.total).toBe(250)
  })

  it('lista vazia', () => {
    expect(agruparItens([])).toEqual([])
  })
})
