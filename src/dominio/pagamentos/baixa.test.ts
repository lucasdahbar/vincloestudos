import { describe, expect, it } from 'vitest'
import { deReal } from '@/dominio/dinheiro'
import { saldoEStatusDaConta, validarBaixa, type Baixa } from './baixa'

const TOTAL = deReal(500)

describe('saldoEStatusDaConta (P3)', () => {
  it('sem baixa nenhuma, preserva o status atual', () => {
    expect(saldoEStatusDaConta(TOTAL, [], 'Pendente')).toEqual({
      saldo: TOTAL,
      status: 'Pendente',
    })
  })

  it('baixa menor que o total deixa a conta parcial', () => {
    expect(saldoEStatusDaConta(TOTAL, [deReal(200)], 'Pendente')).toEqual({
      saldo: deReal(300),
      status: 'Parcial',
    })
  })

  it('soma as baixas', () => {
    expect(saldoEStatusDaConta(TOTAL, [deReal(200), deReal(150)], 'Parcial')).toEqual({
      saldo: deReal(150),
      status: 'Parcial',
    })
  })

  it('baixa igual ao total quita', () => {
    expect(saldoEStatusDaConta(TOTAL, [deReal(500)], 'Pendente')).toEqual({
      saldo: 0,
      status: 'Pago',
    })
  })

  it('pagou a mais: saldo zera, não fica negativo', () => {
    expect(saldoEStatusDaConta(TOTAL, [deReal(600)], 'Pendente')).toEqual({
      saldo: 0,
      status: 'Pago',
    })
  })

  it('conta de valor zero não fica pendente para sempre', () => {
    expect(saldoEStatusDaConta(0, [], 'Pendente').saldo).toBe(0)
  })
})

describe('validarBaixa (P4)', () => {
  const daConta: Baixa = {
    valor: deReal(100),
    origem: 'Conta própria',
    conta_id: 1,
    responsavel_id: null,
  }
  const doResponsavel: Baixa = {
    valor: deReal(100),
    origem: 'Pago por responsável',
    conta_id: null,
    responsavel_id: 7,
  }

  it('aceita baixa pela conta da empresa', () => {
    expect(validarBaixa(daConta, TOTAL)).toEqual([])
  })

  it('aceita pagamento feito direto pelo responsável', () => {
    expect(validarBaixa(doResponsavel, TOTAL)).toEqual([])
  })

  it('aceita origem "Outro" sem conta nem responsável', () => {
    expect(validarBaixa({ ...daConta, origem: 'Outro', conta_id: null }, TOTAL)).toEqual([])
  })

  it('cobra a conta quando a origem é a conta própria', () => {
    expect(validarBaixa({ ...daConta, conta_id: null }, TOTAL)).toContain(
      'Selecione a conta de onde saiu o valor.',
    )
  })

  it('cobra o responsável quando foi ele que pagou', () => {
    expect(validarBaixa({ ...doResponsavel, responsavel_id: null }, TOTAL)).toContain(
      'Selecione o responsável que pagou.',
    )
  })

  it('os dois campos são mutuamente exclusivos', () => {
    const confuso = { ...daConta, responsavel_id: 7 }
    expect(validarBaixa(confuso, TOTAL)).toHaveLength(1)
  })

  it('recusa valor zero ou negativo', () => {
    expect(validarBaixa({ ...daConta, valor: 0 }, TOTAL)).toContain(
      'O valor pago deve ser maior que zero.',
    )
  })

  it('recusa baixa em conta já paga', () => {
    expect(validarBaixa(daConta, 0)).toContain('Esta conta já está paga.')
  })
})
