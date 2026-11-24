import { describe, expect, it } from 'vitest'
import {
  creditoAoCancelarAviso,
  destinoDaAulaNaoCobrada,
  podeCancelarAviso,
  podeVirMesmoAssim,
  voltaParaAMesmaCobranca,
  validarDecisao,
} from './desfecho'

describe('voltaParaAMesmaCobranca (13/11/2026)', () => {
  it('a cobrança de onde a aula saiu segue sem pagamento: a aula volta para ela', () => {
    expect(voltaParaAMesmaCobranca({ status: 'Confirmada', temRecebimento: false })).toBe(true)
    expect(voltaParaAMesmaCobranca({ status: 'Enviada', temRecebimento: false })).toBe(true)
  })

  it('paga, cancelada ou sumida: a aula volta pela geração, como antes', () => {
    expect(voltaParaAMesmaCobranca({ status: 'Parcial', temRecebimento: true })).toBe(false)
    expect(voltaParaAMesmaCobranca({ status: 'Quitada', temRecebimento: true })).toBe(false)
    expect(voltaParaAMesmaCobranca({ status: 'Cancelada', temRecebimento: false })).toBe(false)
    expect(voltaParaAMesmaCobranca(null)).toBe(false)
  })

  it('rascunho não precisa: gerar de novo já põe a aula nele', () => {
    expect(voltaParaAMesmaCobranca({ status: 'Rascunho', temRecebimento: false })).toBe(false)
  })
})

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

describe('destinoDaAulaNaoCobrada (opção A, 13/11/2026)', () => {
  it('cobrando, ou sem item, nada a fazer', () => {
    expect(destinoDaAulaNaoCobrada(true, { status: 'Enviada', temRecebimento: false })).toBe('nada')
    expect(destinoDaAulaNaoCobrada(false, null)).toBe('nada')
    expect(destinoDaAulaNaoCobrada(false, { status: 'Cancelada', temRecebimento: false })).toBe('nada')
  })

  it('cobrança sem nenhum pagamento: a aula sai dela', () => {
    for (const status of ['Rascunho', 'Confirmada', 'Enviada'] as const) {
      expect(destinoDaAulaNaoCobrada(false, { status, temRecebimento: false })).toBe('tirar')
    }
  })

  it('caso Isabela: Confirmada não paga não vira crédito', () => {
    expect(destinoDaAulaNaoCobrada(false, { status: 'Confirmada', temRecebimento: false })).not.toBe('credito')
  })

  it('já entrou dinheiro: vira crédito', () => {
    expect(destinoDaAulaNaoCobrada(false, { status: 'Parcial', temRecebimento: true })).toBe('credito')
    expect(destinoDaAulaNaoCobrada(false, { status: 'Quitada', temRecebimento: true })).toBe('credito')
    expect(destinoDaAulaNaoCobrada(false, { status: 'Enviada', temRecebimento: true })).toBe('credito')
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

// Caso Francisco (24/11/2026): avisou, repôs em outra turma e apareceu na aula
// original mesmo assim. Regra do Julio: é como uma nova matrícula — cobra e o
// professor recebe. A reposição vira aula avulsa, cobrada à parte.
describe('podeVirMesmoAssim', () => {
  const realizada = { origem: 'Aviso' as const, status: 'Realizada' as const, itemDaReposicao: null }

  it('reposição feita e ainda sem cobrança: pode, sem item a tirar', () => {
    expect(podeVirMesmoAssim(realizada)).toEqual({ pode: true, tirarItem: false })
  })

  it('reposição a R$ 0 numa cobrança já paga: pode, e o item sai (o total não muda)', () => {
    expect(podeVirMesmoAssim({ ...realizada, itemDaReposicao: { valor: 0, status: 'Quitada' } })).toEqual({
      pode: true,
      tirarItem: true,
    })
  })

  it('reposição ainda em rascunho: pode, a geração refaz o valor', () => {
    expect(
      podeVirMesmoAssim({ ...realizada, itemDaReposicao: { valor: 3000, status: 'Rascunho' } }),
    ).toEqual({ pode: true, tirarItem: false })
  })

  it('reposição que cobrou diferença numa cobrança confirmada: recusa', () => {
    const r = podeVirMesmoAssim({ ...realizada, itemDaReposicao: { valor: 3000, status: 'Quitada' } })
    expect(r.pode).toBe(false)
  })

  it('reposição ainda não feita, ou sem reposição: não é este caminho', () => {
    for (const status of ['Pendente', 'Agendada', 'Desistida'] as const) {
      expect(podeVirMesmoAssim({ ...realizada, status }).pode).toBe(false)
    }
  })

  it('falta marcada pelo professor ou aula excluída: recusa', () => {
    expect(podeVirMesmoAssim({ ...realizada, origem: 'Falta' }).pode).toBe(false)
    expect(podeVirMesmoAssim({ ...realizada, origem: 'Exclusão' }).pode).toBe(false)
    expect(podeVirMesmoAssim({ ...realizada, aulaExcluida: true }).pode).toBe(false)
  })
})
