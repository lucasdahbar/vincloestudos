import { describe, expect, it } from 'vitest'
import { ehComplementar } from './complementar'

describe('ehComplementar', () => {
  it('a primeira cobranca do mes nao e complementar', () => {
    expect(ehComplementar([])).toBe(false)
  })

  it('depois de uma confirmada, enviada ou paga, e complementar', () => {
    for (const status of ['Confirmada', 'Enviada', 'Parcial', 'Quitada'] as const) {
      expect(ehComplementar([status])).toBe(true)
    }
  })

  it('cancelada nao conta: a familia nunca recebeu aquela cobranca valendo', () => {
    expect(ehComplementar(['Cancelada'])).toBe(false)
  })

  it('outro rascunho nao conta: ainda nao foi mandado', () => {
    expect(ehComplementar(['Rascunho', 'Cancelada'])).toBe(false)
  })

  it('basta uma valendo entre as outras', () => {
    expect(ehComplementar(['Cancelada', 'Quitada'])).toBe(true)
  })
})
