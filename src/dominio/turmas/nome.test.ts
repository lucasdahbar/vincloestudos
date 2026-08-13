import { describe, expect, it } from 'vitest'
import { gerarNomeTurma } from './nome'

describe('gerarNomeTurma', () => {
  it('concatena todos os componentes na ordem do requisito', () => {
    expect(
      gerarNomeTurma({
        materia: 'Matemática',
        anoEscolar: '9º ano',
        escola: 'Colégio São José',
        servico: 'Reforço',
        modalidade: 'Presencial',
      }),
    ).toBe('Matemática · 9º ano · Colégio São José · Reforço · Presencial')
  })

  it('omite materia quando o servico nao permite', () => {
    expect(
      gerarNomeTurma({
        materia: null,
        anoEscolar: '7º ano',
        escola: 'Colégio São José',
        servico: 'Aulão de revisão',
        modalidade: 'Online',
      }),
    ).toBe('7º ano · Colégio São José · Aulão de revisão · Online')
  })

  it('omite escola quando o servico nao permite', () => {
    expect(
      gerarNomeTurma({
        materia: 'Português',
        anoEscolar: '7º ano',
        escola: null,
        servico: 'Aula particular',
        modalidade: 'Online',
      }),
    ).toBe('Português · 7º ano · Aula particular · Online')
  })

  it('ignora componentes vazios ou so com espacos', () => {
    expect(
      gerarNomeTurma({
        materia: '  ',
        anoEscolar: '1º ano',
        escola: '',
        servico: 'Reforço',
        modalidade: 'Presencial',
      }),
    ).toBe('1º ano · Reforço · Presencial')
  })

  it('descreve a turma incompleta enquanto o formulario e preenchido', () => {
    expect(
      gerarNomeTurma({
        materia: null,
        anoEscolar: null,
        escola: null,
        servico: null,
        modalidade: null,
      }),
    ).toBe('')
  })
})
