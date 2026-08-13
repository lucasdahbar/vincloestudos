import { describe, expect, it } from 'vitest'
import { saldoEStatus, validarRecebimento } from './quitacao'

describe('saldoEStatus', () => {
  it('sem recebimento, mantem o status atual e o saldo cheio', () => {
    expect(saldoEStatus(90500, [], 'Confirmada')).toEqual({ saldo: 90500, status: 'Confirmada' })
  })

  it('pagamento parcial deixa a cobranca Parcial', () => {
    expect(saldoEStatus(90500, [50000], 'Confirmada')).toEqual({ saldo: 40500, status: 'Parcial' })
  })

  it('pagamento exato quita', () => {
    expect(saldoEStatus(90500, [90500], 'Confirmada')).toEqual({ saldo: 0, status: 'Quitada' })
  })

  it('pagamento acima do total quita e o saldo nao fica negativo', () => {
    expect(saldoEStatus(90500, [100000], 'Confirmada')).toEqual({ saldo: 0, status: 'Quitada' })
  })

  it('soma varios recebimentos ate quitar', () => {
    expect(saldoEStatus(90500, [30000, 30000, 30500], 'Parcial')).toEqual({
      saldo: 0,
      status: 'Quitada',
    })
  })

  it('preserva o status Enviada quando ainda nao houve pagamento', () => {
    expect(saldoEStatus(90500, [], 'Enviada')).toEqual({ saldo: 90500, status: 'Enviada' })
  })

  it('nao acumula erro de ponto flutuante', () => {
    expect(saldoEStatus(30, [10, 20], 'Confirmada')).toEqual({ saldo: 0, status: 'Quitada' })
  })
})

describe('validarRecebimento', () => {
  it('aceita valor dentro do saldo', () => {
    expect(validarRecebimento(50000, 90500, 1)).toEqual([])
  })

  it('aceita quitar o saldo exato', () => {
    expect(validarRecebimento(90500, 90500, 1)).toEqual([])
  })

  it('rejeita valor zero ou negativo', () => {
    expect(validarRecebimento(0, 90500, 1)).toContain('O valor recebido deve ser maior que zero.')
    expect(validarRecebimento(-100, 90500, 1)).toContain('O valor recebido deve ser maior que zero.')
  })

  it('exige a conta de destino', () => {
    expect(validarRecebimento(50000, 90500, null)).toContain('Selecione a conta que recebeu o valor.')
  })

  it('rejeita baixa em cobranca ja quitada', () => {
    expect(validarRecebimento(1000, 0, 1)).toContain('Esta cobrança já está quitada.')
  })
})
