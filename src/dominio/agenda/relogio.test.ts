import { describe, expect, it } from 'vitest'
import { agoraNaEscola } from './relogio'

describe('agoraNaEscola', () => {
  it('converte o instante para o horário de parede de São Paulo', () => {
    // 21:30 UTC são 18:30 em Brasília.
    expect(agoraNaEscola(new Date('2026-10-01T21:30:00Z'))).toBe('2026-10-01T18:30')
  })

  it('não vira o dia antes da meia-noite de São Paulo', () => {
    // 01:15 UTC do dia 2 ainda são 22:15 do dia 1 em Brasília.
    expect(agoraNaEscola(new Date('2026-10-02T01:15:00Z'))).toBe('2026-10-01T22:15')
  })

  it('usa 00 para meia-noite, e não 24', () => {
    expect(agoraNaEscola(new Date('2026-10-02T03:00:00Z'))).toBe('2026-10-02T00:00')
  })
})
