import { describe, expect, it } from 'vitest'
import {
  aplicarPercentual,
  deNumeric,
  deReal,
  formatarBRL,
  paraNumeric,
  somar,
} from './dinheiro'

describe('deReal', () => {
  it('converte texto em real brasileiro para centavos', () => {
    expect(deReal('105,00')).toBe(10500)
    expect(deReal('1.234,56')).toBe(123456)
    expect(deReal('0,05')).toBe(5)
  })

  it('aceita numero e texto sem centavos', () => {
    expect(deReal(105)).toBe(10500)
    expect(deReal('80')).toBe(8000)
  })

  it('rejeita entrada invalida', () => {
    expect(() => deReal('abc')).toThrow()
  })
})

describe('deNumeric e paraNumeric', () => {
  it('faz a ponte com o numeric do Postgres', () => {
    expect(deNumeric('105.00')).toBe(10500)
    expect(deNumeric('1234.56')).toBe(123456)
    expect(paraNumeric(10500)).toBe('105.00')
    expect(paraNumeric(5)).toBe('0.05')
  })

  it('preserva o valor em ida e volta', () => {
    for (const centavos of [0, 1, 99, 100, 123456, 999999999]) {
      expect(deNumeric(paraNumeric(centavos))).toBe(centavos)
    }
  })
})

describe('somar', () => {
  it('nao acumula erro de ponto flutuante', () => {
    // 0,10 + 0,20 em float daria 0.30000000000000004
    expect(somar(deReal('0,10'), deReal('0,20'))).toBe(deReal('0,30'))
  })

  it('soma uma lista de valores', () => {
    expect(somar(10500, 8000, 5)).toBe(18505)
    expect(somar()).toBe(0)
  })
})

describe('aplicarPercentual', () => {
  it('calcula o repasse do professor', () => {
    expect(aplicarPercentual(10500, 60)).toBe(6300)
    expect(aplicarPercentual(8000, 50)).toBe(4000)
  })

  it('arredonda meio para cima, como no comercio', () => {
    // 10001 * 33,33% = 3333,3333 centavos
    expect(aplicarPercentual(10001, 33.33)).toBe(3333)
    // 1000 * 12,345% = 123,45 centavos
    expect(aplicarPercentual(1000, 12.35)).toBe(124)
  })

  it('trata os extremos', () => {
    expect(aplicarPercentual(10500, 0)).toBe(0)
    expect(aplicarPercentual(10500, 100)).toBe(10500)
  })
})

describe('formatarBRL', () => {
  it('formata para exibicao', () => {
    expect(formatarBRL(10500)).toBe('R$ 105,00')
    expect(formatarBRL(123456)).toBe('R$ 1.234,56')
    expect(formatarBRL(0)).toBe('R$ 0,00')
  })
})
