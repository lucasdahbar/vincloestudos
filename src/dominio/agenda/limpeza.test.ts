import { describe, expect, it } from 'vitest'
import { aulasParaApagar, aulasParaMover, temAlunoNaData, type AulaParaLimpar, type AulaParaMover } from './limpeza'

const aula = (over: Partial<AulaParaLimpar> = {}): AulaParaLimpar => ({
  id: 1,
  data: '2026-10-15',
  horario: '15:00',
  status: 'Agendada',
  vinculada: false,
  ...over,
})

const validas = new Set(['2026-10-13', '2026-10-15'])

describe('aulasParaApagar', () => {
  it('apaga a aula futura vazia que saiu da regra', () => {
    expect(aulasParaApagar([aula({ data: '2026-10-14' })], validas, '15:00', '2026-10-09')).toEqual([1])
  })

  it('mantém a aula que continua na regra', () => {
    expect(aulasParaApagar([aula()], validas, '15:00', '2026-10-09')).toEqual([])
  })

  it('apaga quando o horário da turma mudou', () => {
    expect(aulasParaApagar([aula()], validas, '16:00', '2026-10-09')).toEqual([1])
  })

  it('nunca apaga aula com vínculo: vai para o alerta da gestora', () => {
    expect(
      aulasParaApagar([aula({ data: '2026-10-14', vinculada: true })], validas, '15:00', '2026-10-09'),
    ).toEqual([])
  })

  it('não mexe no passado nem em aula já resolvida', () => {
    expect(
      aulasParaApagar(
        [aula({ id: 2, data: '2026-10-01' }), aula({ id: 3, data: '2026-10-14', status: 'Cancelada' })],
        validas,
        '15:00',
        '2026-10-09',
      ),
    ).toEqual([])
  })
})

describe('temAlunoNaData', () => {
  it('matrícula que cobre a data', () => {
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-10-01', data_fim: null }])).toBe(true)
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-10-15', data_fim: '2026-10-15' }])).toBe(true)
  })

  it('matrícula que acabou antes ou começa depois', () => {
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-09-01', data_fim: '2026-10-14' }])).toBe(false)
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-10-16', data_fim: null }])).toBe(false)
  })
})

describe('aulasParaMover', () => {
  const mover = (aulas: AulaParaMover[], novo = '14:00') =>
    aulasParaMover(aulas, validas, '15:00', novo, '2026-10-09')

  it('move a aula futura que segue na regra quando só o horário mudou', () => {
    expect(mover([{ ...aula(), remarcada: false }])).toEqual([1])
  })

  it('move mesmo com aluno, cobrança ou reposição: o id se mantém e tudo vai junto', () => {
    expect(mover([{ ...aula({ vinculada: true }), remarcada: false }])).toEqual([1])
  })

  it('não move a aula que saiu da regra, essa é da limpeza', () => {
    expect(mover([{ ...aula({ data: '2026-10-14' }), remarcada: false }])).toEqual([])
  })

  it('não move aula remarcada à mão, passada ou já resolvida', () => {
    expect(
      mover([
        { ...aula({ id: 2 }), remarcada: true },
        { ...aula({ id: 3, data: '2026-10-01' }), remarcada: false },
        { ...aula({ id: 4, status: 'Realizada' }), remarcada: false },
      ]),
    ).toEqual([])
  })

  it('não mexe em aula que já está no horário novo', () => {
    expect(mover([{ ...aula({ horario: '14:00' }), remarcada: false }])).toEqual([])
  })

  it('sem mudança de horário não há o que mover', () => {
    expect(mover([{ ...aula(), remarcada: false }], '15:00')).toEqual([])
  })
})
