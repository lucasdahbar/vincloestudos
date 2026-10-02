import { describe, expect, it } from 'vitest'
import {
  DIAS_A_FRENTE,
  modoDaAula,
  telaDoLink,
  ultimoDiaVisivel,
  type AulaDoProfessor,
} from './link-professor'

const aula = (over: Partial<AulaDoProfessor> = {}): AulaDoProfessor => ({
  id: 1,
  data: '2026-09-02',
  horario_inicio: '15:00',
  horario_fim: '16:00',
  turma_nome: 'Matemática · 9º ano',
  ja_registrada: false,
  ...over,
})

/** Relógio de parede da escola, no formato de `agoraNaEscola`. */
const as = (hhmm: string, dia = '2026-09-02') => `${dia}T${hhmm}`

describe('modoDaAula', () => {
  it('abre a chamada durante o horário da aula', () => {
    expect(modoDaAula(aula(), as('15:30'))).toBe('registrar')
  })

  it('abre a chamada uma hora antes de começar', () => {
    expect(modoDaAula(aula(), as('14:05'))).toBe('registrar')
  })

  it('duas horas antes, só dá para ver quem vem', () => {
    expect(modoDaAula(aula(), as('13:00'))).toBe('consultar')
  })

  it('a chamada esquecida continua aberta no fim do dia', () => {
    expect(modoDaAula(aula(), as('23:30'))).toBe('registrar')
  })

  it('a chamada esquecida da semana passada continua aberta', () => {
    expect(modoDaAula(aula({ data: '2026-08-26' }), as('15:00'))).toBe('registrar')
  })

  it('a aula de amanhã é só consulta', () => {
    expect(modoDaAula(aula({ data: '2026-09-03' }), as('15:00'))).toBe('consultar')
  })

  it(`aula a mais de ${DIAS_A_FRENTE} dias fica fora do link`, () => {
    expect(modoDaAula(aula({ data: '2026-09-20' }), as('15:00'))).toBe('fora')
  })

  it('chamada já confirmada não reabre', () => {
    expect(modoDaAula(aula({ ja_registrada: true }), as('15:30'))).toBe('confirmada')
  })
})

describe('telaDoLink', () => {
  const agenda = [
    aula({ id: 1, data: '2026-08-26', horario_inicio: '08:00', horario_fim: '09:00' }),
    aula({ id: 2, horario_inicio: '08:00', horario_fim: '09:00' }),
    aula({ id: 3, horario_inicio: '10:00', horario_fim: '11:00', ja_registrada: true }),
    aula({ id: 4, horario_inicio: '15:00', horario_fim: '16:00' }),
    aula({ id: 5, horario_inicio: '18:00', horario_fim: '19:00' }),
    aula({ id: 6, data: '2026-09-04', horario_inicio: '09:00', horario_fim: '10:00' }),
    aula({ id: 7, data: '2026-09-03', horario_inicio: '09:00', horario_fim: '10:00' }),
    aula({ id: 8, data: '2026-08-20', ja_registrada: true }),
    aula({ id: 9, data: '2026-09-30' }),
  ]

  // O caso relatado: várias aulas no dia, o professor abre o link às 18h30 e
  // só aparecia a das 18h.
  const tela = telaDoLink(agenda, as('18:30'))

  it('mostra todas as aulas que já passaram e não têm chamada, da mais recente para a mais antiga', () => {
    expect(tela.pendentes.map((a) => a.id)).toEqual([5, 4, 2, 1])
  })

  it('mostra as chamadas já confirmadas de hoje', () => {
    expect(tela.confirmadasHoje.map((a) => a.id)).toEqual([3])
  })

  it('mostra os próximos dias em ordem, sem ir longe demais', () => {
    expect(tela.proximas.map((a) => a.id)).toEqual([7, 6])
  })

  it('a aula que começa em menos de uma hora já entra para marcar', () => {
    const t = telaDoLink([aula({ horario_inicio: '19:00', horario_fim: '20:00' })], as('18:30'))
    expect(t.pendentes).toHaveLength(1)
    expect(t.proximas).toEqual([])
  })

  it('desempata pelo nome da turma, para a lista não dançar a cada carregamento', () => {
    const t = telaDoLink(
      [aula({ id: 1, turma_nome: 'Química' }), aula({ id: 2, turma_nome: 'Física' })],
      as('15:30'),
    )
    expect(t.pendentes.map((a) => a.id)).toEqual([2, 1])
  })
})

describe('ultimoDiaVisivel', () => {
  it(`soma ${DIAS_A_FRENTE} dias a hoje, virando o mês`, () => {
    expect(ultimoDiaVisivel('2026-09-28T10:00')).toBe('2026-10-05')
  })
})
