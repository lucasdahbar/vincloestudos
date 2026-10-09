import { describe, expect, it } from 'vitest'
import { avaliarExclusaoAula, validarEscolhas, type SituacaoDaAula } from './exclusao-aula'

const situacao = (over: Partial<SituacaoDaAula> = {}): SituacaoDaAula => ({
  status: 'Agendada',
  temPresenca: false,
  regulares: [],
  reposicoes: [],
  comPendencia: [],
  ...over,
})

describe('avaliarExclusaoAula', () => {
  it('aula com presença não sai: ela aconteceu', () => {
    const r = avaliarExclusaoAula(situacao({ temPresenca: true }))
    expect(r.tipo).toBe('bloqueada')
  })

  it('aula realizada ou já excluída não sai', () => {
    expect(avaliarExclusaoAula(situacao({ status: 'Realizada' })).tipo).toBe('bloqueada')
    expect(avaliarExclusaoAula(situacao({ status: 'Excluída' })).tipo).toBe('bloqueada')
  })

  it('sem ninguém, basta confirmar', () => {
    expect(avaliarExclusaoAula(situacao())).toEqual({ tipo: 'sem-alunos' })
  })

  it('com alunos, lista quem precisa ir para reposição', () => {
    const r = avaliarExclusaoAula(
      situacao({
        regulares: [
          { aluno_id: 1, nome: 'Ana' },
          { aluno_id: 2, nome: 'Bia' }, // já avisou: tem pendência
          { aluno_id: 3, nome: 'Caio' }, // está repondo aqui
        ],
        reposicoes: [{ aluno_id: 3, nome: 'Caio', pendencia_id: 30 }],
        comPendencia: [2],
      }),
    )
    expect(r).toEqual({
      tipo: 'com-alunos',
      regulares: [{ aluno_id: 1, nome: 'Ana' }],
      reposicoes: [{ aluno_id: 3, nome: 'Caio', pendencia_id: 30 }],
    })
  })

  it('só quem já avisou: sem alunos a transferir', () => {
    expect(
      avaliarExclusaoAula(situacao({ regulares: [{ aluno_id: 2, nome: 'Bia' }], comPendencia: [2] })),
    ).toEqual({ tipo: 'sem-alunos' })
  })
})

describe('validarEscolhas', () => {
  const av = {
    tipo: 'com-alunos' as const,
    regulares: [{ aluno_id: 1, nome: 'Ana' }],
    reposicoes: [{ aluno_id: 3, nome: 'Caio', pendencia_id: 30 }],
  }

  it('aceita destino ou "deixar pendente" para cada aluno', () => {
    expect(
      validarEscolhas(av, 99, [{ aluno_id: 1, aula_destino_id: 50 }], [{ pendencia_id: 30, aula_destino_id: null }]),
    ).toEqual([])
  })

  it('exige uma escolha para cada aluno', () => {
    expect(validarEscolhas(av, 99, [], [{ pendencia_id: 30, aula_destino_id: null }])).toEqual([
      'Escolha o que fazer com Ana.',
    ])
  })

  it('não deixa repor na própria aula que está sendo excluída', () => {
    expect(
      validarEscolhas(av, 99, [{ aluno_id: 1, aula_destino_id: 99 }], [{ pendencia_id: 30, aula_destino_id: null }]),
    ).toEqual(['A reposição de Ana não pode ser na aula que está sendo excluída.'])
  })
})
