import { describe, expect, it } from 'vitest'
import { creditoDaDesistencia, podeCancelarAviso, validarDecisao } from './desfecho'

describe('validarDecisao', () => {
  it('aceita cobrar e pagar o professor ("desistência paga")', () => {
    expect(validarDecisao({ cobrar: true, pagarProfessor: true })).toEqual([])
  })

  it('aceita cobrar sem pagar o professor', () => {
    expect(validarDecisao({ cobrar: true, pagarProfessor: false })).toEqual([])
  })

  it('aceita não cobrar', () => {
    expect(validarDecisao({ cobrar: false, pagarProfessor: false })).toEqual([])
  })

  it('recusa pagar o professor por aula que não foi cobrada', () => {
    // A regra só pergunta do professor depois de "cobrar = sim".
    expect(validarDecisao({ cobrar: false, pagarProfessor: true })).not.toEqual([])
  })
})

describe('creditoDaDesistencia', () => {
  it('cobrar a aula não gera crédito', () => {
    expect(creditoDaDesistencia(true, { valor_final: 9000, cobranca_status: 'Enviada' })).toBe(0)
  })

  it('não cobrar aula ainda não cobrada não gera crédito: ela sai da próxima cobrança', () => {
    expect(creditoDaDesistencia(false, null)).toBe(0)
  })

  it('não cobrar aula já cobrada gera crédito do valor cobrado, recebido ou não', () => {
    expect(creditoDaDesistencia(false, { valor_final: 9000, cobranca_status: 'Enviada' })).toBe(9000)
    expect(creditoDaDesistencia(false, { valor_final: 9000, cobranca_status: 'Quitada' })).toBe(9000)
  })

  it('usa o valor final, já com o desconto que a gestora deu', () => {
    expect(creditoDaDesistencia(false, { valor_final: 7000, cobranca_status: 'Confirmada' })).toBe(7000)
  })

  it('cobrança cancelada não conta como cobrada: a aula volta a ser cobrável', () => {
    expect(creditoDaDesistencia(false, { valor_final: 9000, cobranca_status: 'Cancelada' })).toBe(0)
  })

  it('item de valor zero não gera crédito', () => {
    expect(creditoDaDesistencia(false, { valor_final: 0, cobranca_status: 'Enviada' })).toBe(0)
  })
})

describe('podeCancelarAviso', () => {
  const aviso = { origem: 'Aviso' as const, status: 'Pendente' as const, temCredito: false }

  it('cancela aviso ainda pendente', () => {
    expect(podeCancelarAviso(aviso)).toEqual({ pode: true })
  })

  it('cancela aviso sem reposição enquanto não gerou crédito', () => {
    expect(podeCancelarAviso({ ...aviso, status: 'Desistida' })).toEqual({ pode: true })
  })

  it('não cancela depois de gerar crédito: o acerto passa a ser pelo crédito', () => {
    expect(podeCancelarAviso({ ...aviso, status: 'Desistida', temCredito: true }).pode).toBe(false)
  })

  it('não cancela com reposição agendada ou feita', () => {
    expect(podeCancelarAviso({ ...aviso, status: 'Agendada' }).pode).toBe(false)
    expect(podeCancelarAviso({ ...aviso, status: 'Realizada' }).pode).toBe(false)
  })

  it('falta marcada pelo professor não é aviso: não se cancela por aqui', () => {
    expect(podeCancelarAviso({ ...aviso, origem: 'Falta' }).pode).toBe(false)
  })
})
