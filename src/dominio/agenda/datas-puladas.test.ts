import { describe, expect, it } from 'vitest'
import { alertaDaData, datasPuladas } from './datas-puladas'

const feriados = [
  { data: '2026-10-12', nome: 'Nossa Senhora Aparecida' },
  { data: '2026-11-15', nome: 'Proclamação da República' },
]
const recessos = [
  { escola_id: 3, descricao: 'Férias de julho', data_inicio: '2026-07-20', data_fim: '2026-07-22' },
  { escola_id: 9, descricao: 'Recesso da outra escola', data_inicio: '2026-10-12', data_fim: '2026-10-14' },
]

describe('datasPuladas', () => {
  it('feriado vale para qualquer turma', () => {
    const p = datasPuladas(null, feriados, recessos, '2026-10-01', '2026-10-31')
    expect([...p.keys()]).toEqual(['2026-10-12'])
    expect(p.get('2026-10-12')).toEqual({ tipo: 'feriado', nome: 'Nossa Senhora Aparecida' })
  })

  it('recesso só vale para a escola dele, dia a dia', () => {
    const p = datasPuladas(3, [], recessos, '2026-07-01', '2026-07-31')
    expect([...p.keys()]).toEqual(['2026-07-20', '2026-07-21', '2026-07-22'])
    expect(p.get('2026-07-21')).toEqual({ tipo: 'recesso', nome: 'Férias de julho' })
  })

  it('turma sem escola nunca cai em recesso', () => {
    expect(datasPuladas(null, [], recessos, '2026-07-01', '2026-10-31').size).toBe(0)
  })

  it('no mesmo dia, o feriado é o motivo mostrado', () => {
    const p = datasPuladas(9, feriados, recessos, '2026-10-01', '2026-10-31')
    expect(p.get('2026-10-12')?.tipo).toBe('feriado')
    expect(p.get('2026-10-13')?.tipo).toBe('recesso')
  })

  it('recorta pela janela pedida', () => {
    const p = datasPuladas(3, feriados, recessos, '2026-07-21', '2026-07-21')
    expect([...p.keys()]).toEqual(['2026-07-21'])
  })
})

describe('alertaDaData', () => {
  it('avisa feriado', () => {
    expect(alertaDaData('2026-11-15', null, feriados, recessos)).toBe(
      '15/11/2026 é feriado (Proclamação da República).',
    )
  })

  it('avisa recesso da escola da turma', () => {
    expect(alertaDaData('2026-07-20', 3, feriados, recessos)).toBe(
      '20/07/2026 cai no recesso da escola (Férias de julho).',
    )
  })

  it('dia comum não tem alerta', () => {
    expect(alertaDaData('2026-11-16', 3, feriados, recessos)).toBeNull()
  })
})
