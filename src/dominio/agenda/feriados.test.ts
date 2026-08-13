import { describe, expect, it } from 'vitest'
import { conflitosComFeriado, type AulaParaConferir, type Feriado } from './feriados'

const feriados: Feriado[] = [
  { data: '2026-09-07', nome: 'Independência do Brasil' },
  { data: '2026-11-15', nome: 'Proclamação da República' },
]

const aulas: AulaParaConferir[] = [
  { id: 1, data: '2026-09-07', status: 'Agendada' },
  { id: 2, data: '2026-09-08', status: 'Agendada' },
  { id: 3, data: '2026-11-15', status: 'Agendada' },
]

describe('conflitosComFeriado', () => {
  it('encontra as aulas que caem em feriado', () => {
    const c = conflitosComFeriado(aulas, feriados)
    expect(c).toHaveLength(2)
    expect(c[0]).toEqual({ aulaId: 1, data: '2026-09-07', feriado: 'Independência do Brasil' })
  })

  it('ignora aula em dia sem feriado', () => {
    expect(conflitosComFeriado([aulas[1]], feriados)).toEqual([])
  })

  it('ignora aula ja cancelada ou ja marcada como feriado', () => {
    const resolvidas: AulaParaConferir[] = [
      { id: 4, data: '2026-09-07', status: 'Cancelada' },
      { id: 5, data: '2026-09-07', status: 'Feriado' },
    ]
    expect(conflitosComFeriado(resolvidas, feriados)).toEqual([])
  })

  it('ignora aula ja realizada, mesmo em feriado', () => {
    // Se a aula aconteceu, nao ha o que decidir.
    expect(conflitosComFeriado([{ id: 6, data: '2026-09-07', status: 'Realizada' }], feriados)).toEqual([])
  })

  it('nao decide nada sozinho: apenas relata', () => {
    const c = conflitosComFeriado(aulas, feriados)
    expect(c.every((x) => 'aulaId' in x && 'feriado' in x)).toBe(true)
  })

  it('lida com lista vazia dos dois lados', () => {
    expect(conflitosComFeriado([], feriados)).toEqual([])
    expect(conflitosComFeriado(aulas, [])).toEqual([])
  })
})
