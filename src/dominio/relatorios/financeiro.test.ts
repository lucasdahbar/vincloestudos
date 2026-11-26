import { describe, expect, it } from 'vitest'
import {
  agrupar,
  calcularTotais,
  filtrarLinhas,
  juntarLinhas,
  type CobrancaDoRelatorio,
  type LinhaFinanceira,
  paraCsv,
  previstasDaGeracao,
} from './financeiro'
import type { AulaFaturavel } from '@/dominio/cobrancas/geracao'

function linha(p: Partial<LinhaFinanceira>): LinhaFinanceira {
  return {
    chave: '1:1',
    data: '2026-11-05',
    inicio: '15:00',
    fim: '16:00',
    aluno_id: 1,
    aluno: 'Ana',
    responsavel_id: 10,
    responsavel: 'Maria',
    professor_id: 2,
    professor: 'Rafael',
    materia: 'Matemática',
    ano_escolar: '8º ano',
    escola: 'Santo Agostinho',
    turma: 'Turma A',
    servico: 'Aula regular',
    valor: 10000,
    situacao: 'Sem cobrança',
    cobranca_id: null,
    ...p,
  }
}

describe('juntarLinhas', () => {
  it('a linha que já está numa cobrança vale mais que a prevista', () => {
    const r = juntarLinhas(
      [linha({ chave: '1:1', situacao: 'Enviada', cobranca_id: 7, valor: 9000 })],
      [linha({ chave: '1:1' }), linha({ chave: '2:1' })],
    )
    expect(r.map((l) => [l.chave, l.situacao, l.valor])).toEqual([
      ['1:1', 'Enviada', 9000],
      ['2:1', 'Sem cobrança', 10000],
    ])
  })

  it('ordena por data', () => {
    const r = juntarLinhas([linha({ chave: 'b', data: '2026-11-20' })], [linha({ chave: 'a', data: '2026-11-03' })])
    expect(r.map((l) => l.chave)).toEqual(['a', 'b'])
  })
})

describe('calcularTotais', () => {
  const cobrancas = new Map<number, CobrancaDoRelatorio>([
    [7, { id: 7, valor_total: 20000, recebimentos: [{ valor: 10000, conta: 'Itaú' }] }],
    [8, { id: 8, valor_total: 10000, recebimentos: [{ valor: 4000, conta: 'Itaú' }, { valor: 6000, conta: null }] }],
  ])
  const linhas = [
    linha({ chave: 'a', situacao: 'Parcial', cobranca_id: 7, valor: 10000 }),
    linha({ chave: 'b', situacao: 'Parcial', cobranca_id: 7, valor: 10000 }),
    linha({ chave: 'c', situacao: 'Quitada', cobranca_id: 8, valor: 10000 }),
    linha({ chave: 'd', situacao: 'Rascunho', cobranca_id: 9, valor: 5000 }),
    linha({ chave: 'e', situacao: 'Sem cobrança', valor: 3000 }),
    linha({ chave: 'f', situacao: 'Não cobrada', valor: 10000 }),
  ]

  it('vendido é tudo menos a aula que a gestora decidiu não cobrar', () => {
    const t = calcularTotais(linhas, cobrancas)
    expect(t.vendido).toBe(38000)
    expect(t.naoCobrado).toBe(10000)
    expect(t.porSituacao.Parcial).toBe(20000)
    expect(t.porSituacao['Sem cobrança']).toBe(3000)
  })

  it('recebido é rateado pela parte da cobrança que a linha representa', () => {
    const t = calcularTotais(linhas, cobrancas)
    // Cobrança 7: metade recebida, 5000 em cada linha. Cobrança 8: toda.
    expect(t.recebido).toBe(20000)
    // Só o que já foi enviado conta como a receber.
    expect(t.aReceber).toBe(10000)
  })

  it('recebido por conta; o crédito aparece sem conta', () => {
    const t = calcularTotais(linhas, cobrancas)
    expect(t.porConta).toEqual([
      { conta: 'Itaú', valor: 14000 },
      { conta: 'Crédito', valor: 6000 },
    ])
  })

  it('com filtro de conta, o recebido é só o que entrou nela', () => {
    const t = calcularTotais(linhas, cobrancas, 'Itaú')
    expect(t.recebido).toBe(14000)
    expect(t.porConta).toEqual([{ conta: 'Itaú', valor: 14000 }])
    // O vendido não depende da conta.
    expect(t.vendido).toBe(38000)
  })

  it('só a linha filtrada entra no rateio', () => {
    const t = calcularTotais([linhas[0]], cobrancas)
    expect(t.recebido).toBe(5000)
    expect(t.aReceber).toBe(5000)
  })
})

describe('filtrarLinhas', () => {
  const linhas = [
    linha({ chave: 'a', escola: 'Eleva', professor_id: 3 }),
    linha({ chave: 'b', escola: 'Santo Agostinho', situacao: 'Quitada' }),
  ]
  it('combina os filtros', () => {
    expect(filtrarLinhas(linhas, { escola: 'Eleva' }).map((l) => l.chave)).toEqual(['a'])
    expect(filtrarLinhas(linhas, { professor_id: 2, situacao: 'Quitada' }).map((l) => l.chave)).toEqual(['b'])
    expect(filtrarLinhas(linhas, {}).length).toBe(2)
  })
})

describe('agrupar', () => {
  it('soma por dimensão, do maior vendido para o menor', () => {
    const linhas = [
      linha({ chave: 'a', escola: 'Eleva', valor: 1000 }),
      linha({ chave: 'b', escola: 'Santo Agostinho', valor: 3000 }),
      linha({ chave: 'c', escola: 'Eleva', valor: 1000 }),
    ]
    const g = agrupar(linhas, 'escola', new Map())
    expect(g.map((x) => [x.rotulo, x.aulas, x.totais.vendido])).toEqual([
      ['Santo Agostinho', 1, 3000],
      ['Eleva', 2, 2000],
    ])
  })
})

describe('previstasDaGeracao', () => {
  const base: AulaFaturavel = {
    aula_id: 1,
    aluno_id: 1,
    aluno_nome: 'Ana',
    responsavel_id: 10,
    responsavel_nome: 'Maria',
    data: '2026-11-05',
    descricao: 'Matemática — 8º ano — Aula regular',
    valor: 10000,
    status_aula: 'Agendada',
    matricula_ativa: true,
    matricula_reposicao: false,
    ja_cobrada: false,
  }

  it('o que a geração cobraria entra sem cobrança, com o valor dela', () => {
    expect(previstasDaGeracao([base])).toEqual([
      { chave: '1:1', aula_id: 1, aluno_id: 1, valor: 10000, situacao: 'Sem cobrança' },
    ])
  })

  it('a aula que a gestora decidiu não cobrar fica à parte, com o valor da aula', () => {
    const r = previstasDaGeracao([{ ...base, ausencia: { origem: 'Aviso', cobrar: false } }])
    expect(r).toEqual([{ chave: '1:1', aula_id: 1, aluno_id: 1, valor: 10000, situacao: 'Não cobrada' }])
  })

  it('aula cancelada e aluno sem matrícula não entram', () => {
    expect(previstasDaGeracao([{ ...base, status_aula: 'Cancelada' }])).toEqual([])
    expect(previstasDaGeracao([{ ...base, matricula_ativa: false }])).toEqual([])
  })

  it('a diferença da troca de serviço tem chave própria', () => {
    const r = previstasDaGeracao([{ ...base, valor: 2000, diferenca: { id: 5 } }])
    expect(r[0].chave).toBe('1:1:d5')
  })
})

describe('paraCsv (exportar para o Excel)', () => {
  it('separa por ponto e vírgula, com vírgula decimal e o status como na tela', () => {
    const csv = paraCsv([linha({ valor: 12345, situacao: 'Confirmada', aluno: 'Ana "Bia"' })])
    const [cabecalho, primeira] = csv.replace(/^﻿/, '').split('\r\n')
    expect(cabecalho.startsWith('Data;Início;Fim;Aluno;Responsável')).toBe(true)
    expect(primeira).toContain('05/11/2026;15:00;16:00;"Ana ""Bia""";Maria')
    expect(primeira).toContain(';123,45;Pronta p/ enviar')
  })

  it('começa com a marca de UTF-8, para o Excel ler os acentos', () => {
    expect(paraCsv([]).charCodeAt(0)).toBe(0xfeff)
  })
})
