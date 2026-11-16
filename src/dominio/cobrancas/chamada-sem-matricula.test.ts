import { describe, expect, it } from 'vitest'
import { chamadasSemMatricula, type ChamadaDoMes, type MatriculaDoMes } from './chamada-sem-matricula'

/** Caso Alice (16/11/2026): presente em 21/10, 28/10 e 04/11 na turma 64, sem matricula. */
const chamada = (dia: string, extra: Partial<ChamadaDoMes> = {}): ChamadaDoMes => ({
  aula_id: Number(dia.replaceAll('-', '')),
  aluno_id: 71,
  turma_id: 64,
  dia,
  status_aula: 'Realizada',
  ...extra,
})
const matricula = (data_inicio: string, data_fim: string | null, extra: Partial<MatriculaDoMes> = {}): MatriculaDoMes => ({
  aluno_id: 71,
  turma_id: 64,
  data_inicio,
  data_fim,
  status: 'Ativa',
  ...extra,
})

describe('chamadasSemMatricula', () => {
  it('acusa a chamada do aluno sem matricula na data', () => {
    const r = chamadasSemMatricula([chamada('2026-11-04')], [matricula('2026-11-11', '2026-11-11')])
    expect(r.map((c) => c.dia)).toEqual(['2026-11-04'])
  })

  it('matricula que cobre a data nao acusa', () => {
    expect(chamadasSemMatricula([chamada('2026-11-04')], [matricula('2026-10-14', null)])).toEqual([])
  })

  it('matricula de outra turma ou de outro aluno nao cobre', () => {
    const r = chamadasSemMatricula(
      [chamada('2026-11-04')],
      [matricula('2026-10-01', null, { turma_id: 353 }), matricula('2026-10-01', null, { aluno_id: 88 })],
    )
    expect(r).toHaveLength(1)
  })

  it('encerrada sem data de fim nao cobre, como na geracao da cobranca', () => {
    const r = chamadasSemMatricula([chamada('2026-11-04')], [matricula('2026-10-14', null, { status: 'Encerrada' })])
    expect(r).toHaveLength(1)
  })

  it('aula excluida ou cancelada nao entra', () => {
    const r = chamadasSemMatricula(
      [chamada('2026-11-04', { status_aula: 'Excluída' }), chamada('2026-11-05', { status_aula: 'Cancelada' })],
      [],
    )
    expect(r).toEqual([])
  })
})
