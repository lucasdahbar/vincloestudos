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

  it('EXCLUI aula de reposicao sem aula de origem conhecida', () => {
    // Registro anterior a Rodada 3: sem a origem nao ha como calcular a
    // diferenca, e o aluno ja pagou pela aula original.
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

describe('Rodada 3: ausencias e reposicoes na cobranca', () => {
  it('a aula que a gestora decidiu nao cobrar sai da cobranca', () => {
    const c = montarCobrancas([
      base,
      { ...base, aula_id: 2, ausencia: { origem: 'Aviso', cobrar: false } },
    ])
    expect(c[0].itens.map((i) => i.aula_id)).toEqual([1])
  })

  it('a aula perdida e cobrada continua, com a ausencia anotada', () => {
    const [c] = montarCobrancas([{ ...base, ausencia: { origem: 'Aviso', cobrar: true } }])
    expect(c.itens[0].valor_final).toBe(10000)
    expect(c.itens[0].descricao).toContain('não participou: avisou que não vem')
  })

  it('a ausencia ainda sem decisao e cobrada normalmente, anotada', () => {
    // A reposicao pode acontecer: a aula original e cobrada, e a reposicao
    // entra depois com valor zero.
    const [c] = montarCobrancas([{ ...base, ausencia: { origem: 'Falta', cobrar: null } }])
    expect(c.itens[0].valor_final).toBe(10000)
    expect(c.itens[0].descricao).toContain('não participou: faltou')
  })

  it('a anotacao nao usa o separador " — " que o texto da cobranca parte', () => {
    const [c] = montarCobrancas([{ ...base, ausencia: { origem: 'Aviso', cobrar: true } }])
    expect(c.itens[0].descricao.split(' — ')).toHaveLength(base.descricao.split(' — ').length)
  })

  it('reposicao de mesmo valor entra com R$ 0,00', () => {
    const [c] = montarCobrancas([
      { ...base, matricula_reposicao: true, reposicao_de: { data: '2026-08-02', valor: 10000 } },
    ])
    expect(c.itens[0].valor_original).toBe(0)
    expect(c.itens[0].valor_final).toBe(0)
    expect(c.itens[0].descricao).toContain('reposição da aula de 02/08')
  })

  it('reposicao em turma mais barata tambem entra com zero', () => {
    const [c] = montarCobrancas([
      { ...base, valor: 6000, matricula_reposicao: true, reposicao_de: { data: '2026-08-02', valor: 10000 } },
    ])
    expect(c.itens[0].valor_final).toBe(0)
  })

  it('reposicao em turma mais cara cobra so a diferenca', () => {
    const [c] = montarCobrancas([
      { ...base, valor: 15000, matricula_reposicao: true, reposicao_de: { data: '2026-08-02', valor: 10000 } },
    ])
    expect(c.itens[0].valor_final).toBe(5000)
  })

  it('o total soma a reposicao sem distorcer', () => {
    const [c] = montarCobrancas([
      base,
      { ...base, aula_id: 2, matricula_reposicao: true, reposicao_de: { data: '2026-08-02', valor: 10000 } },
    ])
    expect(c.itens).toHaveLength(2)
    expect(c.valor_total).toBe(10000)
  })
})

// Rodada 4 (spec 3.3): a aula excluída continua sendo a que o aluno pagou; a
// reposição dela entra com zero, como qualquer reposição.
describe('aula excluída', () => {
  it('é cobrada de quem foi transferido para reposição', () => {
    const [c] = montarCobrancas([
      { ...base, status_aula: 'Excluída', ausencia: { origem: 'Exclusão', cobrar: null } },
    ])
    expect(c.itens).toHaveLength(1)
    expect(c.itens[0].descricao).toContain('aula excluída, com reposição')
  })

  it('não é cobrada sem pendência de exclusão', () => {
    expect(montarCobrancas([{ ...base, status_aula: 'Excluída' }])).toEqual([])
  })

  it('não é cobrada se a gestora decidiu não cobrar', () => {
    expect(
      montarCobrancas([
        { ...base, status_aula: 'Excluída', ausencia: { origem: 'Exclusão', cobrar: false } },
      ]),
    ).toEqual([])
  })

  it('é cobrada de quem já tinha avisado antes da exclusão', () => {
    const [c] = montarCobrancas([
      { ...base, status_aula: 'Excluída', ausencia: { origem: 'Aviso', cobrar: null } },
    ])
    expect(c.itens).toHaveLength(1)
    expect(c.itens[0].descricao).toContain('avisou que não vem')
  })
})
