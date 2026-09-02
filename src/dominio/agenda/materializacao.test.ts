import { describe, expect, it } from 'vitest'
import { idOcorrenciaLocal, materializar, type RecorrenciaTurma } from './materializacao'

const turma: RecorrenciaTurma = {
  id: 7,
  dias_semana: [2, 4], // terca e quinta
  horario_inicio: '15:00',
  horario_fim: '16:00',
  status: 'Ativa',
}

describe('materializar', () => {
  it('gera uma ocorrencia por dia da semana dentro do intervalo', () => {
    // 03/08/2026 e uma segunda-feira; a semana tem uma terca (04) e uma quinta (06).
    const oc = materializar(turma, '2026-08-03', '2026-08-09')
    expect(oc).toHaveLength(2)
    expect(oc[0].data).toBe('2026-08-04')
    expect(oc[1].data).toBe('2026-08-06')
  })

  it('cobre varias semanas', () => {
    const oc = materializar(turma, '2026-08-03', '2026-08-23')
    expect(oc).toHaveLength(6)
  })

  it('inclui as datas de fronteira do intervalo', () => {
    const oc = materializar(turma, '2026-08-04', '2026-08-06')
    expect(oc.map((o) => o.data)).toEqual(['2026-08-04', '2026-08-06'])
  })

  it('devolve os horarios da turma em cada ocorrencia', () => {
    const [primeira] = materializar(turma, '2026-08-03', '2026-08-09')
    expect(primeira.horario_inicio).toBe('15:00')
    expect(primeira.horario_fim).toBe('16:00')
  })

  it('nao gera nada para turma encerrada', () => {
    expect(materializar({ ...turma, status: 'Encerrada' }, '2026-08-03', '2026-08-23')).toEqual([])
  })

  it('nao gera nada quando a turma nao tem dia da semana', () => {
    expect(materializar({ ...turma, dias_semana: [] }, '2026-08-03', '2026-08-23')).toEqual([])
  })

  it('nao gera nada quando o intervalo e invertido', () => {
    expect(materializar(turma, '2026-08-23', '2026-08-03')).toEqual([])
  })

  it('atribui a cada ocorrencia um id estavel e unico', () => {
    const oc = materializar(turma, '2026-08-03', '2026-08-09')
    expect(oc[0].google_calendar_event_id).toBe('local:t7:2026-08-04T15:00')
    expect(new Set(oc.map((o) => o.google_calendar_event_id)).size).toBe(oc.length)
  })

  it('e deterministico: rodar duas vezes da o mesmo resultado', () => {
    // E o que garante que ressincronizar nao duplica aula.
    expect(materializar(turma, '2026-08-03', '2026-08-23')).toEqual(
      materializar(turma, '2026-08-03', '2026-08-23'),
    )
  })
})

describe('idOcorrenciaLocal', () => {
  it('monta o id no formato esperado', () => {
    expect(idOcorrenciaLocal(7, '2026-08-04', '15:00')).toBe('local:t7:2026-08-04T15:00')
  })
})

// T1 (Rodada 2): turma criada como "Não se repete" — um aulão de revisão, por
// exemplo — rende uma aula so, na data marcada.
describe('turma de data única', () => {
  const aulao = {
    id: 42,
    tipo_recorrencia: 'Único' as const,
    data_unica: '2026-09-15',
    dias_semana: [],
    horario_inicio: '14:00',
    horario_fim: '17:00',
    status: 'Ativa' as const,
  }

  it('gera exatamente uma ocorrência, na data marcada', () => {
    const o = materializar(aulao, '2026-09-01', '2026-09-30')
    expect(o).toHaveLength(1)
    expect(o[0]).toMatchObject({ data: '2026-09-15', horario_inicio: '14:00' })
  })

  it('não gera nada quando a data cai fora da janela', () => {
    expect(materializar(aulao, '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('ignora dias da semana que tenham sobrado no registro', () => {
    // Se a gestora trocar uma turma recorrente para única, os dias antigos não
    // podem continuar gerando aula toda semana.
    const o = materializar({ ...aulao, dias_semana: [1, 3] }, '2026-09-01', '2026-09-30')
    expect(o).toHaveLength(1)
  })

  it('sem data marcada não gera aula', () => {
    expect(materializar({ ...aulao, data_unica: null }, '2026-09-01', '2026-09-30')).toEqual([])
  })

  it('ressincronizar continua dando o mesmo id', () => {
    const a = materializar(aulao, '2026-09-01', '2026-09-30')
    const b = materializar(aulao, '2026-08-01', '2026-12-31')
    expect(a[0].google_calendar_event_id).toBe(b[0].google_calendar_event_id)
  })
})
