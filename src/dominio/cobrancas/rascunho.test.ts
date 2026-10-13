import { describe, expect, it } from 'vitest'
import type { ItemMontado } from './geracao'
import { planejarRascunho, resumoDaGeracao, type ItemDoRascunho } from './rascunho'

const existente = (over: Partial<ItemDoRascunho> = {}): ItemDoRascunho => ({
  id: 1,
  aula_id: 10,
  aluno_id: 100,
  descricao: 'Matemática — Aula regular',
  valor_original: 10000,
  desconto: 0,
  ...over,
})

const montado = (over: Partial<ItemMontado> = {}): ItemMontado => ({
  aula_id: 10,
  aluno_id: 100,
  aluno_nome: 'João',
  data: '2026-10-14',
  descricao: 'Matemática — Aula regular',
  valor_original: 10000,
  desconto: 0,
  valor_final: 10000,
  ...over,
})

describe('planejarRascunho', () => {
  it('rascunho em dia: nada a fazer', () => {
    expect(planejarRascunho([existente()], [montado()])).toEqual({
      apagar: [],
      atualizar: [],
      inserir: [],
    })
  })

  it('aula nova do mês entra', () => {
    const nova = montado({ aula_id: 11 })
    expect(planejarRascunho([existente()], [montado(), nova])).toEqual({
      apagar: [],
      atualizar: [],
      inserir: [nova],
    })
  })

  it('aula que deixou de valer sai do rascunho', () => {
    // Aluno desmatriculado, aula cancelada, "não cobrar" — a montagem não a
    // devolve mais, e o rascunho não pode continuar cobrando.
    expect(planejarRascunho([existente({ id: 7 })], [])).toEqual({
      apagar: [7],
      atualizar: [],
      inserir: [],
    })
  })

  it('valor que mudou é atualizado', () => {
    const r = planejarRascunho([existente()], [montado({ valor_original: 12000, valor_final: 12000 })])
    expect(r.atualizar).toEqual([
      { id: 1, descricao: 'Matemática — Aula regular', valor_original: 12000, desconto: 0, valor_final: 12000 },
    ])
  })

  it('descrição que mudou é atualizada', () => {
    const r = planejarRascunho(
      [existente()],
      [montado({ descricao: 'Matemática — Aula regular (aula excluída, com reposição)' })],
    )
    expect(r.atualizar).toHaveLength(1)
    expect(r.atualizar[0].descricao).toContain('aula excluída')
  })

  it('o desconto digitado à mão sobrevive à nova geração', () => {
    const r = planejarRascunho(
      [existente({ desconto: 2000 })],
      [montado({ valor_original: 12000, valor_final: 12000 })],
    )
    expect(r.atualizar).toEqual([
      { id: 1, descricao: 'Matemática — Aula regular', valor_original: 12000, desconto: 2000, valor_final: 10000 },
    ])
  })

  it('desconto que não muda nada não gera atualização', () => {
    expect(planejarRascunho([existente({ desconto: 2000 })], [montado()]).atualizar).toEqual([])
  })

  it('desconto maior que o novo valor é limitado ao valor', () => {
    const r = planejarRascunho(
      [existente({ desconto: 9000 })],
      [montado({ valor_original: 5000, valor_final: 5000 })],
    )
    expect(r.atualizar[0]).toMatchObject({ valor_original: 5000, desconto: 5000, valor_final: 0 })
  })

  it('é por aula e aluno: o colega da turma em grupo não se confunde', () => {
    const colega = montado({ aluno_id: 200, aluno_nome: 'Maria' })
    const r = planejarRascunho([existente()], [montado(), colega])
    expect(r.inserir).toEqual([colega])
    expect(r.apagar).toEqual([])
  })

  it('mistura: apaga, atualiza e insere de uma vez', () => {
    const r = planejarRascunho(
      [existente({ id: 1 }), existente({ id: 2, aula_id: 20 }), existente({ id: 3, aula_id: 30 })],
      [montado({ aula_id: 10, valor_original: 9000, valor_final: 9000 }), montado({ aula_id: 30 }), montado({ aula_id: 40 })],
    )
    expect(r.apagar).toEqual([2])
    expect(r.atualizar.map((a) => a.id)).toEqual([1])
    expect(r.inserir.map((i) => i.aula_id)).toEqual([40])
  })
})

describe('resumoDaGeracao', () => {
  it('nada mudou', () => {
    expect(resumoDaGeracao({ criadas: 0, adicionados: 0, removidos: 0, atualizados: 0 })).toBe(
      'Nada mudou: os rascunhos já estavam em dia. Cobranças confirmadas não são alteradas.',
    )
  })

  it('só o que mudou, no singular e no plural', () => {
    expect(resumoDaGeracao({ criadas: 1, adicionados: 5, removidos: 1, atualizados: 0 })).toBe(
      '1 cobrança criada, 5 aulas adicionadas, 1 aula removida.',
    )
    expect(resumoDaGeracao({ criadas: 0, adicionados: 0, removidos: 3, atualizados: 2 })).toBe(
      '3 aulas removidas, 2 aulas atualizadas.',
    )
  })
})
