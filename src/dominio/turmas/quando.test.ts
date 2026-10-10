import { describe, expect, it } from 'vitest'
import { periodoDaTurma, quandoDaTurma, rotuloDaTurma, type TurmaComHorario } from './quando'

const turma = (over: Partial<TurmaComHorario> = {}): TurmaComHorario => ({
  nome: 'Matemática · 9º ano · Online',
  tipo_recorrencia: 'Recorrente',
  data_unica: null,
  dias_semana: [1],
  horario_inicio: '15:00:00',
  ...over,
})

describe('quandoDaTurma', () => {
  it('um dia: o nome do dia por extenso', () => {
    expect(quandoDaTurma(turma())).toBe('Segunda-feira, às 15:00')
  })

  it('dois dias: no plural, ligados por "e"', () => {
    expect(quandoDaTurma(turma({ dias_semana: [3, 1] }))).toBe('Segundas e quartas, às 15:00')
  })

  it('três dias ou mais: vírgula entre eles e "e" no último', () => {
    expect(quandoDaTurma(turma({ dias_semana: [5, 1, 3] }))).toBe(
      'Segundas, quartas e sextas, às 15:00',
    )
  })

  it('sábado e domingo, que não têm "-feira"', () => {
    expect(quandoDaTurma(turma({ dias_semana: [6] }))).toBe('Sábado, às 15:00')
    expect(quandoDaTurma(turma({ dias_semana: [0, 6] }))).toBe('Domingos e sábados, às 15:00')
  })

  it('aula única: diz que é única e quando', () => {
    expect(
      quandoDaTurma(turma({ tipo_recorrencia: 'Único', data_unica: '2026-10-12', dias_semana: [] })),
    ).toBe('Aula única em 12/10, às 15:00')
  })

  it('recorrente sem dia cadastrado ainda mostra o horário', () => {
    expect(quandoDaTurma(turma({ dias_semana: [] }))).toBe('Às 15:00')
  })

  it('quinzenal diz o intervalo', () => {
    expect(quandoDaTurma(turma({ dias_semana: [2, 4], frequencia: 'Semanal', intervalo: 2 }))).toBe(
      'Terças e quintas, a cada 2 semanas, às 15:00',
    )
  })

  it('mensal diz o dia do mês', () => {
    expect(
      quandoDaTurma(
        turma({ dias_semana: [], frequencia: 'Mensal', intervalo: 1, data_inicio: '2026-09-15' }),
      ),
    ).toBe('Todo dia 15 do mês, às 15:00')
  })

  it('diária', () => {
    expect(quandoDaTurma(turma({ dias_semana: [], frequencia: 'Diária', intervalo: 1 }))).toBe(
      'Todos os dias, às 15:00',
    )
  })
})

describe('rotuloDaTurma', () => {
  it('junta o nome e o quando, para turmas de mesmo nome se distinguirem', () => {
    expect(rotuloDaTurma(turma({ dias_semana: [1, 3] }))).toBe(
      'Matemática · 9º ano · Online — Segundas e quartas, às 15:00',
    )
  })
})


describe('periodoDaTurma', () => {
  it('recorrente mostra início e fim', () => {
    expect(periodoDaTurma({ tipo_recorrencia: 'Recorrente', data_inicio: '2026-10-01', data_fim: '2026-12-31' })).toBe(
      'De 01/10/2026 a 31/12/2026',
    )
  })

  it('única ou sem período não mostra nada', () => {
    expect(periodoDaTurma({ tipo_recorrencia: 'Único', data_inicio: null, data_fim: null })).toBeNull()
  })
})
