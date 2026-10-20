import { describe, expect, it } from 'vitest'
import { erroDePeriodoSemAula, type AulaDaTurma } from './periodo'

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
