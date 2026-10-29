import { describe, expect, it } from 'vitest'
import { erroDeAulaComChamada, erroDePeriodoSemAula, type AulaComChamada, type AulaDaTurma } from './periodo'

/** Turma de sexta: 09/10 dada, 16/10 remarcada para 15/10, 23/10 excluida, 30/10 agendada. */
const aulas: AulaDaTurma[] = [
  { referencia: '2026-10-09', real: '2026-10-09', status: 'Realizada' },
  { referencia: '2026-10-16', real: '2026-10-15', status: 'Realizada' },
  { referencia: '2026-10-23', real: '2026-10-23', status: 'Excluída' },
  { referencia: '2026-10-30', real: '2026-10-30', status: 'Agendada' },
]

describe('erroDePeriodoSemAula', () => {
  it('aceita um período que pega pelo menos uma aula', () => {
    expect(erroDePeriodoSemAula({ data_inicio: '2026-10-30', data_fim: '2026-10-30' }, aulas)).toBeNull()
    expect(erroDePeriodoSemAula({ data_inicio: '2026-10-01', data_fim: null }, aulas)).toBeNull()
    expect(erroDePeriodoSemAula({ data_inicio: '2026-10-09', data_fim: '2026-10-09' }, aulas)).toBeNull()
  })

  it('caso Kelly (17/10/2026): bloqueia um dia sem aula e aponta a próxima', () => {
    const erro = erroDePeriodoSemAula({ data_inicio: '2026-10-20', data_fim: '2026-10-20' }, aulas)
    expect(erro).toContain('20/10')
    expect(erro).toContain('30/10')
  })

  it('aula excluída, cancelada ou feriado não conta', () => {
    expect(erroDePeriodoSemAula({ data_inicio: '2026-10-23', data_fim: '2026-10-23' }, aulas)).not.toBeNull()
    const outras: AulaDaTurma[] = [
      { referencia: '2026-11-02', real: '2026-11-02', status: 'Feriado' },
      { referencia: '2026-11-09', real: '2026-11-09', status: 'Cancelada' },
    ]
    expect(erroDePeriodoSemAula({ data_inicio: '2026-11-01', data_fim: null }, outras)).not.toBeNull()
  })

  it('aula remarcada: vale a data original, e a mensagem explica', () => {
    // A matricula e conferida pela data da regra da turma (13/10/2026). Quem
    // informa o dia em que a aula acontece de fato nao aparece na lista.
    expect(erroDePeriodoSemAula({ data_inicio: '2026-10-16', data_fim: '2026-10-16' }, aulas)).toBeNull()
    const erro = erroDePeriodoSemAula({ data_inicio: '2026-10-15', data_fim: '2026-10-15' }, aulas)
    expect(erro).toContain('remarcada')
    expect(erro).toContain('16/10')
  })

  it('sem fim e depois da última aula: a turma acabou ou precisa ser renovada', () => {
    const erro = erroDePeriodoSemAula({ data_inicio: '2026-11-05', data_fim: null }, aulas)
    expect(erro).toContain('a partir de 05/11')
    expect(erro).not.toContain('próxima')
  })
})

describe('erroDeAulaComChamada', () => {
  /** Turma de segunda: 05/10 e 12/10 com chamada, 19/10 ainda sem. */
  const turma: AulaComChamada[] = [
    { referencia: '2026-10-05', real: '2026-10-05', status: 'Realizada', comChamada: true, alunoNaChamada: false },
    { referencia: '2026-10-12', real: '2026-10-12', status: 'Agendada', comChamada: true, alunoNaChamada: false },
    { referencia: '2026-10-19', real: '2026-10-19', status: 'Agendada', comChamada: false, alunoNaChamada: false },
  ]

  it('decisão 12 (28/10/2026): bloqueia matrícula nova que pega aula com chamada feita', () => {
    const erro = erroDeAulaComChamada({ data_inicio: '2026-10-01', data_fim: null }, null, turma)
    expect(erro).toContain('05/10')
    expect(erro).toContain('12/10')
    expect(erro).toContain('19/10')
  })

  it('aceita a matrícula a partir da primeira aula sem chamada', () => {
    expect(erroDeAulaComChamada({ data_inicio: '2026-10-13', data_fim: null }, null, turma)).toBeNull()
  })

  it('editar sem mexer no começo não bloqueia: as aulas já estavam no período', () => {
    const antes = { data_inicio: '2026-10-01', data_fim: null }
    expect(erroDeAulaComChamada({ data_inicio: '2026-10-01', data_fim: '2026-10-31' }, antes, turma)).toBeNull()
  })

  it('antecipar o começo para antes de uma aula com chamada bloqueia', () => {
    const antes = { data_inicio: '2026-10-19', data_fim: null }
    expect(erroDeAulaComChamada({ data_inicio: '2026-10-10', data_fim: null }, antes, turma)).toContain('12/10')
  })

  it('aluno que já está na chamada daquela aula não bloqueia', () => {
    const comAluno = turma.map((a) => (a.referencia === '2026-10-05' ? { ...a, alunoNaChamada: true } : a))
    expect(erroDeAulaComChamada({ data_inicio: '2026-10-05', data_fim: '2026-10-05' }, null, comAluno)).toBeNull()
  })

  it('aula excluída não conta, mesmo com registro antigo', () => {
    const excluida: AulaComChamada[] = [
      { referencia: '2026-10-05', real: '2026-10-05', status: 'Excluída', comChamada: true, alunoNaChamada: false },
    ]
    expect(erroDeAulaComChamada({ data_inicio: '2026-10-01', data_fim: null }, null, excluida)).toBeNull()
  })
})
