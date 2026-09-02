import { describe, expect, it } from 'vitest'
import { montarAvisoDeTurma, type DadosDoAviso } from './aviso-professor'

const base: DadosDoAviso = {
  professor_nome: 'Rafael de Oliveira Marcelino',
  turma_nome: 'Matemática · 9º ano · Colégio São José',
  materia: 'Matemática',
  ano_escolar: '9º ano',
  escola: 'Colégio São José',
  modalidade: 'Online',
  tipo_recorrencia: 'Recorrente',
  data_unica: null,
  dias_semana: [2, 4],
  horario_inicio: '15:00',
  horario_fim: '16:00',
  link_videochamada: 'https://meet.google.com/abc-defg-hij',
  link_presenca: 'https://mesinharedonda.app/p/professor/tok123',
}

describe('montarAvisoDeTurma (G4)', () => {
  it('trata o professor pelo primeiro nome', () => {
    expect(montarAvisoDeTurma(base).corpo).toContain('Olá, Rafael!')
  })

  it('o assunto diz de que turma se trata', () => {
    expect(montarAvisoDeTurma(base).assunto).toBe(
      'Nova turma: Matemática · 9º ano · Colégio São José',
    )
  })

  it('traz os dados da turma pedidos no documento', () => {
    const { corpo } = montarAvisoDeTurma(base)
    expect(corpo).toContain('Matéria: Matemática')
    expect(corpo).toContain('Ano escolar: 9º ano')
    expect(corpo).toContain('Escola: Colégio São José')
    expect(corpo).toContain('Modalidade: Online')
  })

  it('traz dias da semana e horário quando é recorrente', () => {
    expect(montarAvisoDeTurma(base).corpo).toContain('Quando: Ter, Qui, das 15:00 às 16:00')
  })

  it('traz a data quando a turma não se repete', () => {
    const { corpo } = montarAvisoDeTurma({
      ...base,
      tipo_recorrencia: 'Único',
      data_unica: '2026-09-15',
      dias_semana: [],
    })
    expect(corpo).toContain('Data: 15/09/2026, das 15:00 às 16:00')
    expect(corpo).not.toContain('Quando:')
  })

  it('traz os dois links', () => {
    const { corpo } = montarAvisoDeTurma(base)
    expect(corpo).toContain('https://meet.google.com/abc-defg-hij')
    expect(corpo).toContain('https://mesinharedonda.app/p/professor/tok123')
  })

  it('explica que o link de presença é permanente', () => {
    // Sem isso o professor fica esperando um link novo a cada aula.
    expect(montarAvisoDeTurma(base).corpo).toContain('sempre o mesmo')
  })

  it('omite as linhas de link em vez de escrever "null"', () => {
    const { corpo } = montarAvisoDeTurma({
      ...base,
      link_videochamada: null,
      link_presenca: null,
    })
    expect(corpo).not.toContain('null')
    expect(corpo).not.toContain('Link da videochamada')
  })

  it('omite os campos que a turma não usa', () => {
    const { corpo } = montarAvisoDeTurma({ ...base, escola: null, materia: null })
    expect(corpo).not.toContain('Escola:')
    expect(corpo).not.toContain('Matéria:')
    expect(corpo).toContain('Ano escolar: 9º ano')
  })
})
