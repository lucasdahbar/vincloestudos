import { describe, expect, it } from 'vitest'
import {
  datasDaRegra,
  deveOferecerRenovacao,
  fimAutomatico,
  fimRenovado,
  opcaoDaRegra,
  regraDaOpcao,
  resolverFim,
  somarDias,
  textoDaRegra,
  type RegraRecorrencia,
} from './recorrencia'

const regra = (over: Partial<RegraRecorrencia> = {}): RegraRecorrencia => ({
  frequencia: 'Semanal',
  intervalo: 1,
  dias_semana: [2, 4], // terça e quinta
  data_inicio: '2026-09-01', // uma terça
  data_fim: '2026-12-31',
  ...over,
})

describe('somarDias', () => {
  it('atravessa a virada do mês e do ano', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2026-09-01', -1)).toBe('2026-08-31')
  })
})

describe('datasDaRegra', () => {
  it('semanal: os dias escolhidos, toda semana', () => {
    expect(datasDaRegra(regra(), '2026-09-01', '2026-09-10')).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-08',
      '2026-09-10',
    ])
  })

  it('quinzenal: semana sim, semana não, contando da semana do início', () => {
    // 02/09/2026 é quarta. A semana dela (30/08 a 05/09) vale: só a quinta 03,
    // porque a terça 01 é antes do início. A seguinte não. A outra vale.
    const r = regra({ intervalo: 2, data_inicio: '2026-09-02' })
    expect(datasDaRegra(r, '2026-09-01', '2026-09-20')).toEqual([
      '2026-09-03',
      '2026-09-15',
      '2026-09-17',
    ])
  })

  it('quinzenal: abrir a janela no meio não muda a âncora', () => {
    const r = regra({ intervalo: 2, data_inicio: '2026-09-02' })
    expect(datasDaRegra(r, '2026-09-10', '2026-09-20')).toEqual(['2026-09-15', '2026-09-17'])
  })

  it('quinzenal: semana do início sem dia escolhido depois dele', () => {
    // 14/10/2026 é quarta e só há terças: a semana do início fica sem aula, como no Google (RRULE).
    const r = regra({ intervalo: 2, dias_semana: [2], data_inicio: '2026-10-14' })
    expect(datasDaRegra(r, '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-27',
      '2026-11-10',
      '2026-11-24',
    ])
  })

  it('diária a cada 2 dias, inclusive fim de semana', () => {
    const r = regra({ frequencia: 'Diária', intervalo: 2, dias_semana: [] })
    expect(datasDaRegra(r, '2026-09-01', '2026-09-07')).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-05',
      '2026-09-07',
    ])
    expect(datasDaRegra(r, '2026-09-02', '2026-09-04')).toEqual(['2026-09-03'])
  })

  it('mensal: o mesmo dia do mês da data de início', () => {
    const r = regra({ frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-09-15' })
    expect(datasDaRegra(r, '2026-09-01', '2026-12-31')).toEqual([
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ])
  })

  it('mensal no dia 31 pula o mês que não tem 31, como o Google', () => {
    const r = regra({ frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-08-31' })
    expect(datasDaRegra(r, '2026-08-01', '2026-12-31')).toEqual([
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ])
  })

  it('mensal a cada 2 meses atravessa o ano', () => {
    const r = regra({
      frequencia: 'Mensal',
      intervalo: 2,
      dias_semana: [],
      data_inicio: '2026-09-15',
      data_fim: '2027-01-31',
    })
    expect(datasDaRegra(r, '2026-09-01', '2027-01-31')).toEqual([
      '2026-09-15',
      '2026-11-15',
      '2027-01-15',
    ])
  })

  it('para na data de fim', () => {
    expect(datasDaRegra(regra({ data_fim: '2026-09-03' }), '2026-09-01', '2026-09-30')).toEqual([
      '2026-09-01',
      '2026-09-03',
    ])
  })

  it('nada quando a janela está fora do período', () => {
    expect(datasDaRegra(regra(), '2027-01-01', '2027-01-31')).toEqual([])
    expect(datasDaRegra(regra(), '2026-08-01', '2026-08-31')).toEqual([])
  })

  it('é determinística', () => {
    expect(datasDaRegra(regra(), '2026-09-01', '2026-12-31')).toEqual(
      datasDaRegra(regra(), '2026-09-01', '2026-12-31'),
    )
  })
})

describe('textoDaRegra', () => {
  it('semanal', () => {
    expect(textoDaRegra(regra())).toBe('Terças e quintas')
    expect(textoDaRegra(regra({ dias_semana: [1] }))).toBe('Segunda-feira')
  })

  it('quinzenal e semanas personalizadas', () => {
    expect(textoDaRegra(regra({ intervalo: 2 }))).toBe('Terças e quintas, a cada 2 semanas')
  })

  it('segunda a sexta', () => {
    expect(textoDaRegra(regra({ dias_semana: [5, 4, 3, 2, 1] }))).toBe('De segunda a sexta')
  })

  it('diária', () => {
    expect(textoDaRegra(regra({ frequencia: 'Diária', dias_semana: [] }))).toBe('Todos os dias')
    expect(textoDaRegra(regra({ frequencia: 'Diária', intervalo: 3, dias_semana: [] }))).toBe(
      'A cada 3 dias',
    )
  })

  it('mensal', () => {
    const m = regra({ frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-09-15' })
    expect(textoDaRegra(m)).toBe('Todo dia 15 do mês')
    expect(textoDaRegra({ ...m, intervalo: 2 })).toBe('Dia 15, a cada 2 meses')
  })
})

describe('fim automático', () => {
  it('é 31/12 do ano corrente', () => {
    expect(fimAutomatico('2026-10-09', '2026-10-01')).toBe('2026-12-31')
  })

  it('turma que começa no ano seguinte vai até o fim daquele ano', () => {
    expect(fimAutomatico('2026-10-09', '2027-02-01')).toBe('2027-12-31')
  })
})

describe('resolverFim', () => {
  it('fim informado pela gestora vale e não é automático', () => {
    expect(resolverFim('2026-11-30', '2026-10-01', null, '2026-10-09')).toEqual({
      data_fim: '2026-11-30',
      fim_automatico: false,
    })
  })

  it('sem fim, o sistema usa 31/12', () => {
    expect(resolverFim(null, '2026-10-01', null, '2026-10-09')).toEqual({
      data_fim: '2026-12-31',
      fim_automatico: true,
    })
  })

  it('editar uma turma já renovada sem informar fim não a encurta', () => {
    const atual = { data_fim: '2027-12-31', fim_automatico: true }
    expect(resolverFim(null, '2026-10-01', atual, '2026-12-10')).toEqual({
      data_fim: '2027-12-31',
      fim_automatico: true,
    })
  })

  it('apagar o fim definido volta ao automático', () => {
    const atual = { data_fim: '2026-11-30', fim_automatico: false }
    expect(resolverFim(null, '2026-10-01', atual, '2026-10-09')).toEqual({
      data_fim: '2026-12-31',
      fim_automatico: true,
    })
  })
})

describe('renovação', () => {
  const t = {
    status: 'Ativa' as const,
    tipo_recorrencia: 'Recorrente' as const,
    fim_automatico: true,
    data_fim: '2026-12-31',
  }

  it('oferece em dezembro', () => {
    expect(deveOferecerRenovacao(t, '2026-12-05')).toBe(true)
  })

  it('não oferece com mais de um mês até o fim', () => {
    expect(deveOferecerRenovacao(t, '2026-10-09')).toBe(false)
  })

  it('continua oferecendo depois que acabou', () => {
    expect(deveOferecerRenovacao(t, '2027-01-10')).toBe(true)
  })

  it('não oferece para fim escolhido pela gestora, encerrada ou única', () => {
    expect(deveOferecerRenovacao({ ...t, fim_automatico: false }, '2026-12-05')).toBe(false)
    expect(deveOferecerRenovacao({ ...t, status: 'Encerrada' }, '2026-12-05')).toBe(false)
    expect(deveOferecerRenovacao({ ...t, tipo_recorrencia: 'Único' }, '2026-12-05')).toBe(false)
  })

  it('estende até o fim do ano seguinte', () => {
    expect(fimRenovado('2026-12-31', '2026-12-05')).toBe('2027-12-31')
  })

  it('se já acabou, estende até o fim do ano de hoje', () => {
    expect(fimRenovado('2026-12-31', '2027-01-10')).toBe('2027-12-31')
  })
})

describe('opção do formulário', () => {
  const r = (frequencia: 'Diária' | 'Semanal' | 'Mensal', intervalo: number, dias: number[]) => ({
    tipo_recorrencia: 'Recorrente' as const,
    frequencia,
    intervalo,
    dias_semana: dias,
  })

  it('reconhece cada opção a partir da regra gravada', () => {
    expect(opcaoDaRegra({ ...r('Semanal', 1, []), tipo_recorrencia: 'Único' })).toBe('Único')
    expect(opcaoDaRegra(r('Semanal', 1, [1, 2, 3, 4, 5]))).toBe('Diário')
    expect(opcaoDaRegra(r('Semanal', 1, [2, 4]))).toBe('Semanal')
    expect(opcaoDaRegra(r('Semanal', 2, [2, 4]))).toBe('Quinzenal')
    expect(opcaoDaRegra(r('Mensal', 1, []))).toBe('Mensal')
    expect(opcaoDaRegra(r('Semanal', 3, [2]))).toBe('Personalizado')
    expect(opcaoDaRegra(r('Diária', 1, []))).toBe('Personalizado')
    expect(opcaoDaRegra(r('Mensal', 2, []))).toBe('Personalizado')
  })

  it('converte cada opção pronta na regra', () => {
    expect(regraDaOpcao('Diário', [])).toEqual({
      frequencia: 'Semanal',
      intervalo: 1,
      dias_semana: [1, 2, 3, 4, 5],
    })
    expect(regraDaOpcao('Semanal', [2, 4])).toEqual({
      frequencia: 'Semanal',
      intervalo: 1,
      dias_semana: [2, 4],
    })
    expect(regraDaOpcao('Quinzenal', [2, 4])).toEqual({
      frequencia: 'Semanal',
      intervalo: 2,
      dias_semana: [2, 4],
    })
    expect(regraDaOpcao('Mensal', [2, 4])).toEqual({
      frequencia: 'Mensal',
      intervalo: 1,
      dias_semana: [],
    })
  })
})
