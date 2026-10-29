import { describe, expect, it } from 'vitest'
import { saldoDoCredito, validarAbatimento, validarCancelamento, validarDevolucao } from './saldo'

describe('saldoDoCredito', () => {
  it('sem uso, o saldo e o valor do credito', () => {
    expect(saldoDoCredito(10000, [])).toBe(10000)
  })

  it('pode ser usado em partes', () => {
    // Decisao de 09/10/2026: credito de R$ 100 abatido de cobranca de R$ 60
    // deixa R$ 40 guardados.
    expect(saldoDoCredito(10000, [6000])).toBe(4000)
    expect(saldoDoCredito(10000, [6000, 4000])).toBe(0)
  })
})

describe('validarAbatimento', () => {
  it('aceita abater ate o menor entre o saldo do credito e o da cobranca', () => {
    expect(validarAbatimento({ valor: 6000, saldoCredito: 10000, saldoCobranca: 6000 })).toEqual([])
  })

  it('recusa abater mais do que o credito tem', () => {
    expect(validarAbatimento({ valor: 12000, saldoCredito: 10000, saldoCobranca: 20000 })).not.toEqual([])
  })

  it('recusa abater mais do que a cobranca deve', () => {
    // O que sobra fica no credito; nao vira troco.
    expect(validarAbatimento({ valor: 8000, saldoCredito: 10000, saldoCobranca: 6000 })).not.toEqual([])
  })

  it('recusa valor zero ou negativo', () => {
    expect(validarAbatimento({ valor: 0, saldoCredito: 10000, saldoCobranca: 6000 })).not.toEqual([])
  })
})

describe('validarDevolucao', () => {
  it('devolve ate o saldo', () => {
    expect(validarDevolucao({ valor: 4000, saldoCredito: 4000 })).toEqual([])
  })

  it('recusa devolver mais do que o saldo', () => {
    expect(validarDevolucao({ valor: 5000, saldoCredito: 4000 })).not.toEqual([])
  })
})

describe('validarCancelamento', () => {
  it('decisão de 28/10/2026: cancela o saldo inteiro, com motivo', () => {
    expect(validarCancelamento({ saldoCredito: 10500, motivo: 'gerado por engano' })).toEqual([])
  })

  it('pede o motivo', () => {
    expect(validarCancelamento({ saldoCredito: 10500, motivo: '  ' })).toEqual(['Informe o motivo do cancelamento.'])
  })

  it('crédito já usado não tem o que cancelar', () => {
    expect(validarCancelamento({ saldoCredito: 0, motivo: 'x' })).toEqual(['Este crédito não tem saldo para cancelar.'])
  })
})
