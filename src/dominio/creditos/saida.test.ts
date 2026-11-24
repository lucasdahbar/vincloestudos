import { describe, expect, it } from 'vitest'
import { acertoDaSaida, acertoDaVolta, type CreditoDaAula, type ItemDaSaida } from './saida'

const item = (id: number, data: string, extra: Partial<ItemDaSaida> = {}): ItemDaSaida => ({
  id,
  aula_id: 100 + id,
  data,
  valor_final: 10500,
  cobranca_status: 'Quitada',
  temRecebimento: true,
  jaVirouCredito: false,
  ...extra,
})

const semPagamento = (status: 'Rascunho' | 'Confirmada' | 'Enviada') => ({
  cobranca_status: status,
  temRecebimento: false,
})

describe('acertoDaSaida', () => {
  it('decisão 11 (28/10/2026): aula paga depois da saída vira crédito', () => {
    const r = acertoDaSaida(
      [item(1, '2026-11-02'), item(2, '2026-11-09'), item(3, '2026-10-26')],
      [{ data_inicio: '2026-10-05', data_fim: '2026-10-29' }],
    )
    expect(r.creditar.map((c) => c.item_id)).toEqual([1, 2])
    expect(r.creditar[0].valor).toBe(10500)
    expect(r.tirar).toEqual([])
  })

  it('opção A (13/11/2026): cobrança sem nenhum pagamento, a aula só sai dela', () => {
    const r = acertoDaSaida(
      [
        item(1, '2026-11-02', semPagamento('Rascunho')),
        item(2, '2026-11-09', semPagamento('Confirmada')),
        item(3, '2026-11-16', semPagamento('Enviada')),
      ],
      [{ data_inicio: '2026-10-05', data_fim: '2026-10-29' }],
    )
    expect(r.tirar).toEqual([1, 2, 3])
    expect(r.creditar).toEqual([])
  })

  it('pagamento parcial já é dinheiro recebido: vira crédito', () => {
    const r = acertoDaSaida(
      [item(1, '2026-11-02', { cobranca_status: 'Parcial' })],
      [{ data_inicio: '2026-10-05', data_fim: '2026-10-29' }],
    )
    expect(r.creditar.map((c) => c.item_id)).toEqual([1])
  })

  it('cancelada, zerada ou já creditada: nada', () => {
    const r = acertoDaSaida(
      [
        item(2, '2026-11-09', { cobranca_status: 'Cancelada', temRecebimento: false }),
        item(3, '2026-11-16', { valor_final: 0 }),
        item(4, '2026-11-23', { jaVirouCredito: true }),
        item(5, '2026-11-30', { ...semPagamento('Confirmada'), jaVirouCredito: true }),
      ],
      [{ data_inicio: '2026-10-05', data_fim: '2026-10-29' }],
    )
    expect(r).toEqual({ creditar: [], tirar: [] })
  })

  it('aula coberta por outra matrícula do mesmo aluno na turma fica', () => {
    const r = acertoDaSaida(
      [item(1, '2026-11-02'), item(2, '2026-11-09')],
      [
        { data_inicio: '2026-10-05', data_fim: '2026-10-29' },
        { data_inicio: '2026-11-09', data_fim: '2026-11-09' },
      ],
    )
    expect(r.creditar.map((c) => c.item_id)).toEqual([1])
  })

  it('matrícula excluída (sem período nenhum): tudo sai', () => {
    const r = acertoDaSaida([item(1, '2026-11-02'), item(2, '2026-11-09', semPagamento('Rascunho'))], [])
    expect(r.creditar.map((c) => c.item_id)).toEqual([1])
    expect(r.tirar).toEqual([2])
  })

  it('matrícula sem fim cobre tudo dali em diante', () => {
    const r = acertoDaSaida([item(1, '2027-03-01')], [{ data_inicio: '2026-10-05', data_fim: null }])
    expect(r).toEqual({ creditar: [], tirar: [] })
  })
})

// Volta (Julio, 24/11/2026): o aluno saiu, a aula paga virou crédito, e depois
// ele voltou para fazer essa aula.
describe('acertoDaVolta', () => {
  const credito = (extra: Partial<CreditoDaAula> = {}): CreditoDaAula => ({
    credito_id: 7,
    data: '2026-11-24',
    valor: 10500,
    usos: [],
    ...extra,
  })
  const avulsa = [{ data_inicio: '2026-11-24', data_fim: '2026-11-24' }]

  it('crédito intacto de uma aula que voltou a ser dele: estorna e solta da aula', () => {
    expect(acertoDaVolta([credito()], avulsa)).toEqual({
      cancelar: [{ credito_id: 7, data: '2026-11-24', estornar: 10500 }],
      jaUsados: [],
    })
  })

  it('crédito já cancelado à mão: só solta, nada a estornar', () => {
    expect(acertoDaVolta([credito({ usos: [{ tipo: 'Cancelamento', valor: 10500 }] })], avulsa).cancelar).toEqual([
      { credito_id: 7, data: '2026-11-24', estornar: 0 },
    ])
  })

  it('crédito já abatido ou devolvido, mesmo em parte: não mexe, avisa', () => {
    const r = acertoDaVolta([credito({ usos: [{ tipo: 'Devolução', valor: 5000 }] })], avulsa)
    expect(r).toEqual({ cancelar: [], jaUsados: [{ credito_id: 7, data: '2026-11-24' }] })
  })

  it('aula fora das matrículas: o crédito continua', () => {
    expect(acertoDaVolta([credito({ data: '2026-12-01' })], avulsa)).toEqual({ cancelar: [], jaUsados: [] })
  })

  it('matrícula em aberto cobre as aulas dali em diante', () => {
    const r = acertoDaVolta([credito({ data: '2026-12-01' })], [{ data_inicio: '2026-11-24', data_fim: null }])
    expect(r.cancelar).toHaveLength(1)
  })
})
