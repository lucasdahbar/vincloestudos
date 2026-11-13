import { describe, expect, it } from 'vitest'
import { creditoAoCancelarAviso, creditoDaDesistencia, podeCancelarAviso, validarDecisao } from './desfecho'

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

  it('item em rascunho não é aula cobrada: não gera crédito', () => {
    // Rascunho ainda nao foi para o responsavel. Antes gerava credito e deixava
    // o item no rascunho: a gestora confirmava e o responsavel pagava e ainda
    // ganhava o credito. O item simplesmente sai do rascunho.
    expect(creditoDaDesistencia(false, { valor_final: 9000, cobranca_status: 'Rascunho' })).toBe(0)
  })

  it('item de valor zero não gera crédito', () => {
    expect(creditoDaDesistencia(false, { valor_final: 0, cobranca_status: 'Enviada' })).toBe(0)
  })
})

describe('podeCancelarAviso', () => {
  const aviso = { origem: 'Aviso' as const, status: 'Pendente' as const, temCredito: false }

  it('não cancela a exclusão da aula: não é um aviso', () => {
    const r = podeCancelarAviso({ ...aviso, origem: 'Exclusão' })
    expect(r.pode).toBe(false)
    if (!r.pode) expect(r.motivo).toContain('excluída')
  })

  it('não cancela aviso de aula excluída', () => {
    const r = podeCancelarAviso({ ...aviso, aulaExcluida: true })
    expect(r.pode).toBe(false)
  })

  it('cancela aviso ainda pendente', () => {
    expect(podeCancelarAviso(aviso)).toEqual({ pode: true })
  })

  it('cancela aviso sem reposição enquanto não gerou crédito', () => {
    expect(podeCancelarAviso({ ...aviso, status: 'Desistida' })).toEqual({ pode: true })
  })

  it('não cancela depois de o crédito ser abatido ou devolvido: o dinheiro já se mexeu', () => {
    expect(podeCancelarAviso({ ...aviso, status: 'Desistida', temCredito: true }).pode).toBe(false)
  })
})

describe('creditoAoCancelarAviso', () => {
  it('sem crédito, não há o que estornar', () => {
    expect(creditoAoCancelarAviso(null)).toEqual({ usado: false, estornar: 0 })
  })

  it('crédito intacto: estorna o valor inteiro', () => {
    expect(creditoAoCancelarAviso({ valor: 12000, usos: [] })).toEqual({ usado: false, estornar: 12000 })
  })

  it('caso Isabela (12/11/2026): crédito já cancelado à mão não trava, nada a estornar', () => {
    expect(
      creditoAoCancelarAviso({ valor: 12000, usos: [{ tipo: 'Cancelamento', valor: 12000 }] }),
    ).toEqual({ usado: false, estornar: 0 })
  })

  it('abatido ou devolvido, mesmo em parte: trava', () => {
    expect(creditoAoCancelarAviso({ valor: 12000, usos: [{ tipo: 'Abatimento', valor: 5000 }] }).usado).toBe(true)
    expect(creditoAoCancelarAviso({ valor: 12000, usos: [{ tipo: 'Devolução', valor: 100 }] }).usado).toBe(true)
  })
})

describe('podeCancelarAviso (reposição e professor)', () => {
  const aviso = { origem: 'Aviso' as const, status: 'Pendente' as const, temCredito: false }

  it('não cancela com reposição agendada ou feita', () => {
    expect(podeCancelarAviso({ ...aviso, status: 'Agendada' }).pode).toBe(false)
    expect(podeCancelarAviso({ ...aviso, status: 'Realizada' }).pode).toBe(false)
  })

  it('nao cancela depois de entrar no pagamento do professor', () => {
    expect(podeCancelarAviso({ ...aviso, status: 'Desistida', pagoAoProfessor: true }).pode).toBe(false)
  })

  it('falta marcada pelo professor não é aviso: não se cancela por aqui', () => {
    expect(podeCancelarAviso({ ...aviso, origem: 'Falta' }).pode).toBe(false)
  })
})
