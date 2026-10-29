import { describe, expect, it } from 'vitest'
import { acertoDaSaida, type ItemDaSaida } from './saida'

const item = (id: number, data: string, extra: Partial<ItemDaSaida> = {}): ItemDaSaida => ({
  id,
  aula_id: 100 + id,
  data,
  valor_final: 10500,
  cobranca_status: 'Confirmada',
  jaVirouCredito: false,
  ...extra,
})

describe('acertoDaSaida', () => {
  it('decisão 11 (28/10/2026): aula cobrada depois da saída vira crédito', () => {
    const r = acertoDaSaida(
      [item(1, '2026-11-02'), item(2, '2026-11-09'), item(3, '2026-10-26')],
      [{ data_inicio: '2026-10-05', data_fim: '2026-10-29' }],
    )
    expect(r.creditar.map((c) => c.item_id)).toEqual([1, 2])
    expect(r.creditar[0].valor).toBe(10500)
    expect(r.tirarDoRascunho).toEqual([])
  })

  it('em rascunho a aula ainda não foi cobrada: o item só sai', () => {
    const r = acertoDaSaida(
      [item(1, '2026-11-02', { cobranca_status: 'Rascunho' })],
      [{ data_inicio: '2026-10-05', data_fim: '2026-10-29' }],
    )
    expect(r.tirarDoRascunho).toEqual([1])
    expect(r.creditar).toEqual([])
  })

  it('recebida também vira crédito; cancelada, zerada ou já creditada não', () => {
    const r = acertoDaSaida(
      [
        item(1, '2026-11-02', { cobranca_status: 'Quitada' }),
        item(2, '2026-11-09', { cobranca_status: 'Cancelada' }),
        item(3, '2026-11-16', { valor_final: 0 }),
        item(4, '2026-11-23', { jaVirouCredito: true }),
      ],
      [{ data_inicio: '2026-10-05', data_fim: '2026-10-29' }],
    )
    expect(r.creditar.map((c) => c.item_id)).toEqual([1])
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

  it('matrícula excluída (sem período nenhum): tudo o que foi cobrado sai', () => {
    const r = acertoDaSaida([item(1, '2026-11-02'), item(2, '2026-11-09', { cobranca_status: 'Rascunho' })], [])
    expect(r.creditar.map((c) => c.item_id)).toEqual([1])
    expect(r.tirarDoRascunho).toEqual([2])
  })

  it('matrícula sem fim cobre tudo dali em diante', () => {
    const r = acertoDaSaida([item(1, '2027-03-01')], [{ data_inicio: '2026-10-05', data_fim: null }])
    expect(r).toEqual({ creditar: [], tirarDoRascunho: [] })
  })
})
