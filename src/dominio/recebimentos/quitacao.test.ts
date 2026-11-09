import { describe, expect, it } from 'vitest'
import {
  saldoEStatus,
  statusAposCancelarRecebimento,
  validarCancelamentoRecebimento,
  validarRecebimento,
} from './quitacao'

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

describe('cancelar um recebimento (pedido do Julio, 09/11/2026)', () => {
  // Decisao de 09/11/2026: a familia que pagou ja tinha a cobranca. Ela volta
  // a Enviada (Em aberto), e nao a Confirmada, que sai de Recebimentos.
  it('sem recebimento restante, a cobrança quitada volta a Enviada com o saldo cheio', () => {
    expect(statusAposCancelarRecebimento(90500, [], 'Quitada')).toEqual({ saldo: 90500, status: 'Enviada' })
  })

  it('sem recebimento restante, a parcial também volta a Enviada', () => {
    expect(statusAposCancelarRecebimento(90500, [], 'Parcial')).toEqual({ saldo: 90500, status: 'Enviada' })
  })

  it('rascunho que tinha um crédito abatido continua rascunho', () => {
    expect(statusAposCancelarRecebimento(90500, [], 'Rascunho')).toEqual({ saldo: 90500, status: 'Rascunho' })
  })

  it('sobrando outro recebimento, a quitada vira Parcial', () => {
    expect(statusAposCancelarRecebimento(90500, [40000], 'Quitada')).toEqual({ saldo: 50500, status: 'Parcial' })
  })

  it('sobrando o bastante, continua Quitada', () => {
    expect(statusAposCancelarRecebimento(90500, [90500], 'Quitada')).toEqual({ saldo: 0, status: 'Quitada' })
  })

  it('exige o motivo', () => {
    expect(validarCancelamentoRecebimento('', 'Quitada')).toEqual(['Diga o motivo do cancelamento.'])
    expect(validarCancelamentoRecebimento('   ', 'Parcial')).toEqual(['Diga o motivo do cancelamento.'])
    expect(validarCancelamentoRecebimento('valor errado', 'Parcial')).toEqual([])
  })

  it('cobrança cancelada não tem recebimento para cancelar', () => {
    expect(validarCancelamentoRecebimento('engano', 'Cancelada')).toEqual([
      'A cobrança está cancelada: o recebimento não pode ser mexido.',
    ])
  })
})
