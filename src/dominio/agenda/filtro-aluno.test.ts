import { describe, expect, it } from 'vitest'
import { aulasDoAluno } from './filtro-aluno'

const aula = (id: number, turma_id: number, dia: string) => ({
  id,
  turma_id,
  data_hora_referencia: `${dia}T15:00:00`,
})

describe('aulasDoAluno', () => {
  const aulas = [
    aula(1, 10, '2031-03-03'),
    aula(2, 10, '2031-03-10'),
    aula(3, 10, '2031-03-17'),
    aula(4, 20, '2031-03-12'),
    aula(5, 20, '2031-03-19'),
  ]

  it('fica so com as aulas das turmas em que o aluno esta, dentro das datas da matricula', () => {
    const r = aulasDoAluno(aulas, [{ turma_id: 10, data_inicio: '2031-03-05', data_fim: '2031-03-12' }])
    expect(r.map((a) => a.id)).toEqual([2])
  })

  it('matricula sem data de saida vale dali em diante', () => {
    const r = aulasDoAluno(aulas, [{ turma_id: 10, data_inicio: '2031-03-10', data_fim: null }])
    expect(r.map((a) => a.id)).toEqual([2, 3])
  })

  it('a reposicao (matricula so na data) entra, as outras aulas daquela turma nao', () => {
    const r = aulasDoAluno(aulas, [
      { turma_id: 10, data_inicio: '2031-03-01', data_fim: null },
      { turma_id: 20, data_inicio: '2031-03-12', data_fim: '2031-03-12' },
    ])
    expect(r.map((a) => a.id)).toEqual([1, 2, 3, 4])
  })

  it('sem matricula, nenhuma aula', () => {
    expect(aulasDoAluno(aulas, [])).toEqual([])
  })
})
