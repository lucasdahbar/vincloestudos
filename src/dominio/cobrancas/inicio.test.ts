import { describe, expect, it } from 'vitest'
import { abateCredito, mesCobravel } from './inicio'

describe('mesCobravel', () => {
  it('novembro de 2026 em diante pode ser gerado', () => {
    expect(mesCobravel('2026-11')).toBe(true)
    expect(mesCobravel('2027-01')).toBe(true)
  })

  it('outubro e antes foram cobrados fora do sistema', () => {
    expect(mesCobravel('2026-10')).toBe(false)
    expect(mesCobravel('2025-12')).toBe(false)
  })
})

describe('abateCredito', () => {
  it('abate de cobranca confirmada, em aberto ou paga em parte', () => {
    expect(abateCredito('Confirmada', '2026-11-01')).toBe(true)
    expect(abateCredito('Enviada', '2026-11-01')).toBe(true)
    expect(abateCredito('Parcial', '2026-12-01')).toBe(true)
  })

  it('rascunho nao: ele e refeito a cada geracao', () => {
    expect(abateCredito('Rascunho', '2026-11-01')).toBe(false)
  })

  it('quitada e cancelada nao', () => {
    expect(abateCredito('Quitada', '2026-11-01')).toBe(false)
    expect(abateCredito('Cancelada', '2026-11-01')).toBe(false)
  })

  it('cobranca de antes do sistema nao, mesmo confirmada', () => {
    expect(abateCredito('Confirmada', '2026-10-01')).toBe(false)
  })
})
