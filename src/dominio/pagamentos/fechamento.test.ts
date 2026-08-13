import { describe, expect, it } from 'vitest'
import { calcularFechamento, type PresencaRemunerada } from './fechamento'

const base: PresencaRemunerada = {
  presenca_id: 1,
  aluno_id: 10,
  aluno_nome: 'João',
  turma_id: 5,
  turma_nome: 'Matemática 9º ano',
  data_aula: '2026-08-04',
  presente: true,
  flag_reposicao: false,
  valor_servico: 10000,
  percentual: 60,
  ja_paga: false,
}

describe('calcularFechamento', () => {
  it('calcula valor do servico x percentual do professor', () => {
    const f = calcularFechamento([base])
    expect(f.itens[0].valor_professor).toBe(6000)
    expect(f.valor_total).toBe(6000)
  })

  it('soma varias presencas', () => {
    const f = calcularFechamento([base, { ...base, presenca_id: 2 }, { ...base, presenca_id: 3 }])
    expect(f.valor_total).toBe(18000)
    expect(f.itens).toHaveLength(3)
  })

  it('IGNORA ausencia: so presenca confirmada gera valor', () => {
    const f = calcularFechamento([base, { ...base, presenca_id: 2, presente: false }])
    expect(f.itens).toHaveLength(1)
    expect(f.valor_total).toBe(6000)
  })

  it('INCLUI presenca em aula de reposicao', () => {
    // O professor que ministrou a reposicao recebe normalmente (RN 5.4).
    const f = calcularFechamento([{ ...base, flag_reposicao: true }])
    expect(f.valor_total).toBe(6000)
  })

  it('IGNORA presenca ja paga em outro fechamento', () => {
    const f = calcularFechamento([base, { ...base, presenca_id: 2, ja_paga: true }])
    expect(f.itens).toHaveLength(1)
  })

  it('usa o percentual vigente na data de cada aula', () => {
    // Mudanca de percentual nao afeta o historico (RN 8.2).
    const f = calcularFechamento([
      { ...base, presenca_id: 1, percentual: 60 },
      { ...base, presenca_id: 2, percentual: 55 },
    ])
    expect(f.itens.map((i) => i.valor_professor)).toEqual([6000, 5500])
    expect(f.valor_total).toBe(11500)
  })

  it('usa o valor do servico vigente na data de cada aula', () => {
    const f = calcularFechamento([
      { ...base, presenca_id: 1, valor_servico: 10000 },
      { ...base, presenca_id: 2, valor_servico: 12000 },
    ])
    expect(f.itens.map((i) => i.valor_professor)).toEqual([6000, 7200])
  })

  it('arredonda meio para cima em percentual quebrado', () => {
    const f = calcularFechamento([{ ...base, valor_servico: 10001, percentual: 33.33 }])
    expect(f.itens[0].valor_professor).toBe(3333)
  })

  it('devolve zero quando nao ha presenca remunerada', () => {
    expect(calcularFechamento([])).toEqual({ itens: [], valor_total: 0 })
    expect(calcularFechamento([{ ...base, presente: false }])).toEqual({ itens: [], valor_total: 0 })
  })

  it('preserva aluno, turma e data para o relatorio de conferencia', () => {
    // Operacionais 8.3: o relatorio detalha aluno por aluno e aula por aula.
    const [item] = calcularFechamento([base]).itens
    expect(item.aluno_nome).toBe('João')
    expect(item.turma_nome).toBe('Matemática 9º ano')
    expect(item.data_aula).toBe('2026-08-04')
    expect(item.percentual_aplicado).toBe(60)
    expect(item.valor_servico).toBe(10000)
  })

  it('ordena por data para o relatorio', () => {
    const f = calcularFechamento([
      { ...base, presenca_id: 1, data_aula: '2026-08-20' },
      { ...base, presenca_id: 2, data_aula: '2026-08-04' },
    ])
    expect(f.itens.map((i) => i.data_aula)).toEqual(['2026-08-04', '2026-08-20'])
  })
})
