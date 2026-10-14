import { describe, expect, it } from 'vitest'
import {
  classificarPelaCobranca,
  type CandidataAoPagamento,
  type ParteCobrada,
} from './base-cobrada'

const confirmada = (valor: number): ParteCobrada => ({ situacao: 'confirmada', valor })
const rascunho = (valor: number): ParteCobrada => ({ situacao: 'rascunho', valor })
const nenhuma: ParteCobrada = { situacao: 'nenhuma', valor: 0 }

const candidata = (over: Partial<CandidataAoPagamento> = {}): CandidataAoPagamento => ({
  presenca_id: 1,
  pendencia_id: null,
  desistencia: false,
  aluno_id: 10,
  aluno_nome: 'João',
  turma_id: 5,
  turma_nome: 'Matemática 9º ano',
  data_aula: '2026-10-05',
  flag_reposicao: false,
  percentual: 60,
  cobrancas: [confirmada(9000)],
  ...over,
})

describe('classificarPelaCobranca', () => {
  it('aula com cobrança confirmada entra, pelo valor efetivamente cobrado', () => {
    // O cadastro do servico diria 10000; a gestora cobrou 9000 depois do ajuste.
    const r = classificarPelaCobranca([candidata()])
    expect(r.pagaveis).toHaveLength(1)
    expect(r.pagaveis[0]).toMatchObject({ presenca_id: 1, valor_servico: 9000, percentual: 60, presente: true })
    expect(r.aguardando).toEqual([])
  })

  it('a base é o valor com o desconto que a gestora deu', () => {
    const r = classificarPelaCobranca([candidata({ cobrancas: [confirmada(7000)] })])
    expect(r.pagaveis[0].valor_servico).toBe(7000)
  })

  it('aula só em rascunho não entra: vai para o alerta, dizendo que está em rascunho', () => {
    const r = classificarPelaCobranca([candidata({ cobrancas: [rascunho(9000)] })])
    expect(r.pagaveis).toEqual([])
    expect(r.aguardando).toEqual([
      {
        aluno_nome: 'João',
        turma_nome: 'Matemática 9º ano',
        data_aula: '2026-10-05',
        desistencia: false,
        motivo: 'A cobrança desta aula ainda está em rascunho.',
      },
    ])
  })

  it('aula sem cobrança nenhuma também vai para o alerta', () => {
    const r = classificarPelaCobranca([candidata({ cobrancas: [nenhuma] })])
    expect(r.pagaveis).toEqual([])
    expect(r.aguardando[0].motivo).toBe('Esta aula ainda não foi cobrada.')
  })

  it('reposição: o professor recebe pelo que foi cobrado na aula original mais a diferença', () => {
    // Original 9000 (confirmada) + reposicao em turma mais cara, 1000 de diferenca.
    const r = classificarPelaCobranca([
      candidata({ flag_reposicao: true, cobrancas: [confirmada(9000), confirmada(1000)] }),
    ])
    expect(r.pagaveis[0].valor_servico).toBe(10000)
    expect(r.pagaveis[0].flag_reposicao).toBe(true)
  })

  it('reposição de R$ 0 não zera o professor: vale a aula original', () => {
    const r = classificarPelaCobranca([
      candidata({ flag_reposicao: true, cobrancas: [confirmada(9000), confirmada(0)] }),
    ])
    expect(r.pagaveis[0].valor_servico).toBe(9000)
  })

  it('reposição espera as duas cobranças: se uma está em rascunho, vai para o alerta', () => {
    const r = classificarPelaCobranca([
      candidata({ flag_reposicao: true, cobrancas: [confirmada(9000), rascunho(0)] }),
    ])
    expect(r.pagaveis).toEqual([])
    expect(r.aguardando[0].motivo).toBe('A cobrança desta aula ainda está em rascunho.')
  })

  it('reposição sem a aula original conhecida não tem como ser paga: alerta', () => {
    const r = classificarPelaCobranca([candidata({ flag_reposicao: true, cobrancas: [] })])
    expect(r.pagaveis).toEqual([])
    expect(r.aguardando[0].motivo).toBe('Esta aula ainda não foi cobrada.')
  })

  it('a falta de cobrança pesa mais que o rascunho no motivo', () => {
    const r = classificarPelaCobranca([
      candidata({ flag_reposicao: true, cobrancas: [rascunho(9000), nenhuma] }),
    ])
    expect(r.aguardando[0].motivo).toBe('Esta aula ainda não foi cobrada.')
  })

  it('desistência paga segue a mesma regra e sai marcada', () => {
    const r = classificarPelaCobranca([
      candidata({ presenca_id: null, pendencia_id: 7, desistencia: true, cobrancas: [confirmada(8000)] }),
      candidata({ presenca_id: null, pendencia_id: 8, desistencia: true, cobrancas: [rascunho(8000)] }),
    ])
    expect(r.desistencias).toHaveLength(1)
    expect(r.desistencias[0]).toMatchObject({ pendencia_id: 7, valor_servico: 8000, ja_paga: false })
    expect(r.pagaveis).toEqual([])
    expect(r.aguardando).toHaveLength(1)
    expect(r.aguardando[0].desistencia).toBe(true)
  })

  it('o alerta sai em ordem de data', () => {
    const r = classificarPelaCobranca([
      candidata({ presenca_id: 2, data_aula: '2026-10-12', cobrancas: [nenhuma] }),
      candidata({ presenca_id: 3, data_aula: '2026-10-05', cobrancas: [nenhuma] }),
    ])
    expect(r.aguardando.map((a) => a.data_aula)).toEqual(['2026-10-05', '2026-10-12'])
  })
})
