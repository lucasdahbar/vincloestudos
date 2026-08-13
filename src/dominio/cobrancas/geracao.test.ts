import { describe, expect, it } from 'vitest'
import { montarCobrancas, type AulaFaturavel } from './geracao'

const base: AulaFaturavel = {
  aula_id: 1,
  aluno_id: 10,
  aluno_nome: 'João',
  responsavel_id: 100,
  responsavel_nome: 'Ana Ribeiro',
  data: '2026-08-04',
  descricao: 'Matemática 9º ano — Aula regular',
  valor: 10000,
  status_aula: 'Agendada',
  matricula_ativa: true,
  matricula_reposicao: false,
  ja_cobrada: false,
}

describe('montarCobrancas', () => {
  it('agrupa por responsavel', () => {
    const c = montarCobrancas([
      base,
      { ...base, aula_id: 2, aluno_id: 11, aluno_nome: 'Maria' },
      { ...base, aula_id: 3, responsavel_id: 200, responsavel_nome: 'Marcos', aluno_id: 12 },
    ])
    expect(c).toHaveLength(2)
    expect(c[0].responsavel_id).toBe(100)
    expect(c[0].itens).toHaveLength(2)
  })

  it('soma o valor bruto e o total', () => {
    const [c] = montarCobrancas([base, { ...base, aula_id: 2, valor: 5000 }])
    expect(c.valor_bruto).toBe(15000)
    expect(c.valor_desconto).toBe(0)
    expect(c.valor_total).toBe(15000)
  })

  it('EXCLUI aula de matricula de reposicao', () => {
    // A reposicao nao gera cobranca: o aluno ja pagou pela aula original.
    const c = montarCobrancas([base, { ...base, aula_id: 2, matricula_reposicao: true }])
    expect(c[0].itens).toHaveLength(1)
    expect(c[0].itens[0].aula_id).toBe(1)
  })

  it('EXCLUI aula ja cobrada em outra geracao', () => {
    // Idempotencia: reprocessar o mes nao duplica item.
    const c = montarCobrancas([base, { ...base, aula_id: 2, ja_cobrada: true }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('EXCLUI aula cancelada', () => {
    const c = montarCobrancas([base, { ...base, aula_id: 2, status_aula: 'Cancelada' }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('EXCLUI aula marcada como feriado', () => {
    const c = montarCobrancas([base, { ...base, aula_id: 2, status_aula: 'Feriado' }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('EXCLUI aula de matricula inativa', () => {
    const c = montarCobrancas([base, { ...base, aula_id: 2, matricula_ativa: false }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('nao gera cobranca para responsavel sem aula faturavel', () => {
    expect(montarCobrancas([{ ...base, matricula_reposicao: true }])).toEqual([])
  })

  it('e idempotente: rodar de novo com tudo ja cobrado nao gera nada', () => {
    const primeira = montarCobrancas([base, { ...base, aula_id: 2 }])
    expect(primeira[0].itens).toHaveLength(2)

    const segunda = montarCobrancas([
      { ...base, ja_cobrada: true },
      { ...base, aula_id: 2, ja_cobrada: true },
    ])
    expect(segunda).toEqual([])
  })

  it('preserva a ordem cronologica dos itens', () => {
    const [c] = montarCobrancas([
      { ...base, aula_id: 2, data: '2026-08-20' },
      { ...base, aula_id: 1, data: '2026-08-04' },
    ])
    expect(c.itens.map((i) => i.data)).toEqual(['2026-08-04', '2026-08-20'])
  })

  it('mantem os alunos separados dentro da mesma cobranca', () => {
    const [c] = montarCobrancas([
      base,
      { ...base, aula_id: 2, aluno_id: 11, aluno_nome: 'Maria', valor: 8000 },
    ])
    expect(new Set(c.itens.map((i) => i.aluno_id))).toEqual(new Set([10, 11]))
    expect(c.valor_total).toBe(18000)
  })

  it('nao usa ponto flutuante: valores em centavos somam exato', () => {
    const [c] = montarCobrancas(
      Array.from({ length: 3 }, (_, i) => ({ ...base, aula_id: i + 1, valor: 10 })),
    )
    expect(c.valor_total).toBe(30)
  })
})
