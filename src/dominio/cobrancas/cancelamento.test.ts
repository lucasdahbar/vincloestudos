import { describe, expect, it } from 'vitest'
import { podeCancelarCobranca, podeCancelarContaPagar } from './cancelamento'

describe('podeCancelarCobranca (C7)', () => {
  it('permite cancelar cobrança confirmada sem recebimento', () => {
    expect(podeCancelarCobranca('Confirmada', 0)).toEqual({ pode: true })
  })

  it('permite cancelar cobrança enviada sem recebimento', () => {
    expect(podeCancelarCobranca('Enviada', 0)).toEqual({ pode: true })
  })

  it('barra quando já houve recebimento', () => {
    expect(podeCancelarCobranca('Parcial', 1)).toMatchObject({ pode: false })
  })

  it('barra a quitada', () => {
    expect(podeCancelarCobranca('Quitada', 3)).toMatchObject({ pode: false })
  })

  it('o recebimento pesa mais que o status', () => {
    // Um status desatualizado não pode liberar o cancelamento de algo já pago.
    expect(podeCancelarCobranca('Confirmada', 1)).toMatchObject({
      pode: false,
      motivo: expect.stringContaining('já tem pagamento'),
    })
  })

  it('rascunho se exclui, não se cancela', () => {
    expect(podeCancelarCobranca('Rascunho', 0)).toMatchObject({
      pode: false,
      motivo: expect.stringContaining('excluído'),
    })
  })

  it('não cancela duas vezes', () => {
    expect(podeCancelarCobranca('Cancelada', 0)).toMatchObject({ pode: false })
  })
})

describe('podeCancelarContaPagar (P5)', () => {
  it('permite cancelar conta pendente', () => {
    expect(podeCancelarContaPagar('Pendente', 0)).toEqual({ pode: true })
  })

  it('barra a parcial', () => {
    expect(podeCancelarContaPagar('Parcial', 1)).toMatchObject({ pode: false })
  })

  it('barra a paga', () => {
    expect(podeCancelarContaPagar('Pago', 1)).toMatchObject({ pode: false })
  })

  it('barra quando há baixa, mesmo com status Pendente', () => {
    expect(podeCancelarContaPagar('Pendente', 1)).toMatchObject({ pode: false })
  })

  it('não cancela duas vezes', () => {
    expect(podeCancelarContaPagar('Cancelada', 0)).toMatchObject({ pode: false })
  })
})

describe('podeCancelarCobranca e o pagamento do professor', () => {
  it('cobrança que já serviu de base para pagar um professor não se cancela', () => {
    // O professor recebe pelo valor cobrado (13/10/2026): cancelar e gerar de
    // novo com outro desconto faria o pagamento divergir do que foi cobrado.
    const r = podeCancelarCobranca('Confirmada', 0, 2)
    expect(r.pode).toBe(false)
    if (!r.pode) expect(r.motivo).toContain('pagamento de um professor')
  })

  it('sem aula paga ao professor, segue como antes', () => {
    expect(podeCancelarCobranca('Confirmada', 0, 0)).toEqual({ pode: true })
  })
})
