import { describe, expect, it } from 'vitest'
import {
  montarRegistro,
  reposicoesQueNaoAconteceram,
  type MatriculadoNaAula,
  type RespostaChamada,
} from './registro'

const matriculados: MatriculadoNaAula[] = [
  { aluno_id: 1, nome: 'João Ribeiro', flag_reposicao: false },
  { aluno_id: 2, nome: 'Maria Ribeiro', flag_reposicao: false },
  { aluno_id: 3, nome: 'Pedro Tavares', flag_reposicao: true },
]

describe('montarRegistro', () => {
  it('cria uma presenca para cada aluno matriculado', () => {
    const respostas: RespostaChamada[] = [
      { aluno_id: 1, presente: true },
      { aluno_id: 2, presente: true },
      { aluno_id: 3, presente: true },
    ]
    const r = montarRegistro({ aulaId: 10, professorId: 5, matriculados, respostas })
    expect(r.presencas).toHaveLength(3)
    expect(r.presencas.every((p) => p.aula_id === 10 && p.registrado_por === 5)).toBe(true)
  })

  it('marca a aula como Realizada', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: true }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: true }],
    })
    expect(r.novoStatusAula).toBe('Realizada')
  })

  it('assume presente quando o professor nao respondeu por um aluno', () => {
    // O formulario tem Presente como padrao (Operacionais 5.5).
    const r = montarRegistro({ aulaId: 10, professorId: 5, matriculados, respostas: [] })
    expect(r.presencas.every((p) => p.presente)).toBe(true)
  })

  it('gera pendencia de reposicao para cada falta', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: false }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: true }],
    })
    expect(r.pendencias).toEqual([{ aluno_id: 1, aula_origem_id: 10 }])
  })

  it('NAO gera pendencia quando a falta e em aula de reposicao', () => {
    // Pedro (id 3) esta na turma por matricula de reposicao: faltar a reposicao
    // nao gera uma nova reposicao (Operacionais 5.2).
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: true }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: false }],
    })
    expect(r.pendencias).toEqual([])
  })

  it('marca flag_reposicao na presenca de quem esta ali por reposicao', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: true }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: true }],
    })
    expect(r.presencas.find((p) => p.aluno_id === 3)!.flag_reposicao).toBe(true)
    expect(r.presencas.find((p) => p.aluno_id === 1)!.flag_reposicao).toBe(false)
  })

  it('preserva a observacao por aluno', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: false, observacao: 'Avisou que estava doente' }],
    })
    expect(r.presencas.find((p) => p.aluno_id === 1)!.observacao).toBe('Avisou que estava doente')
  })

  it('lista as faltas para o aviso a gestora', () => {
    // Operacionais 5.2: a gestora e notificada a cada ausencia.
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: false }, { aluno_id: 3, presente: false }],
    })
    expect(r.ausentes.map((a) => a.nome)).toEqual(['João Ribeiro', 'Pedro Tavares'])
  })

  it('ignora resposta de aluno que nao esta matriculado', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 999, presente: false }],
    })
    expect(r.presencas.map((p) => p.aluno_id)).toEqual([1, 2, 3])
    expect(r.pendencias).toEqual([])
  })

  it('nao gera presenca quando ninguem esta matriculado', () => {
    const r = montarRegistro({ aulaId: 10, professorId: 5, matriculados: [], respostas: [] })
    expect(r.presencas).toEqual([])
    expect(r.novoStatusAula).toBe('Realizada')
  })
})

describe('reposicoesQueNaoAconteceram', () => {
  const reposicoes = [
    { id: 10, aluno_id: 1, status: 'Agendada' as const },
    { id: 11, aluno_id: 2, status: 'Agendada' as const },
    { id: 12, aluno_id: 3, status: 'Realizada' as const },
    { id: 13, aluno_id: 4, status: 'Desistida' as const },
  ]

  it('quem faltou à reposição volta a ser pendente (Julio, 20/10/2026)', () => {
    const presencas = [
      { aluno_id: 1, presente: false },
      { aluno_id: 2, presente: true },
    ]
    expect(reposicoesQueNaoAconteceram(reposicoes, presencas)).toEqual([10])
  })

  it('a reposição dada por concluída também volta, se a chamada foi corrigida para falta', () => {
    expect(reposicoesQueNaoAconteceram(reposicoes, [{ aluno_id: 3, presente: false }])).toEqual([12])
  })

  it('reposição desistida não volta, nem a de quem não estava na chamada', () => {
    const presencas = [
      { aluno_id: 4, presente: false },
      { aluno_id: 99, presente: false },
    ]
    expect(reposicoesQueNaoAconteceram(reposicoes, presencas)).toEqual([])
  })
})

// R3 (Rodada 2)
