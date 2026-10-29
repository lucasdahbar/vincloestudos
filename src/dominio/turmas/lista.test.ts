import { describe, expect, it } from 'vitest'
import { alunosDaTurma, temAulaPelaFrente, turmaVencida } from './lista'

const HOJE = '2026-10-29'
const serie = { tipo_recorrencia: 'Recorrente' as const, status: 'Ativa' as const, data_unica: null, data_fim: '2026-12-31', fim_automatico: true }
const unica = { tipo_recorrencia: 'Único' as const, status: 'Ativa' as const, data_unica: '2026-10-20', data_fim: null, fim_automatico: false }

describe('turmaVencida', () => {
  it('aula única que já passou fecha sozinha', () => {
    expect(turmaVencida(unica, HOJE)).toBe(true)
    expect(turmaVencida({ ...unica, data_unica: HOJE }, HOJE)).toBe(false)
  })

  it('encerramento com data futura: quando a data chega, a turma fecha', () => {
    expect(turmaVencida({ ...serie, data_fim: '2026-10-28', fim_automatico: false }, HOJE)).toBe(true)
    expect(turmaVencida({ ...serie, data_fim: HOJE, fim_automatico: false }, HOJE)).toBe(false)
  })

  it('fim de 31/12 posto pelo sistema não fecha: é a renovação de fim de ano', () => {
    expect(turmaVencida({ ...serie, data_fim: '2026-10-28', fim_automatico: true }, HOJE)).toBe(false)
  })

  it('turma já encerrada não fecha de novo', () => {
    expect(turmaVencida({ ...unica, status: 'Encerrada' }, HOJE)).toBe(false)
  })
})

describe('temAulaPelaFrente', () => {
  it('série ativa com fim hoje ou depois', () => {
    expect(temAulaPelaFrente(serie, HOJE)).toBe(true)
    expect(temAulaPelaFrente({ ...serie, data_fim: '2026-10-28' }, HOJE)).toBe(false)
    expect(temAulaPelaFrente({ ...serie, status: 'Encerrada' }, HOJE)).toBe(false)
  })

  it('aula única nunca entra na lista de séries: ela fica na agenda', () => {
    expect(temAulaPelaFrente({ ...unica, data_unica: '2026-11-05' }, HOJE)).toBe(false)
  })
})

describe('alunosDaTurma', () => {
  const m = (extra: object) => ({ flag_reposicao: false, data_inicio: '2026-10-05', data_fim: null as string | null, ...extra })

  it('conta só quem ainda está ou vai estar na turma', () => {
    expect(alunosDaTurma([m({}), m({ data_fim: '2026-10-28' }), m({ data_inicio: '2026-11-03' })], HOJE)).toEqual({
      fixos: 2,
      avulsos: 0,
      reposicoes: 0,
    })
  })

  it('avulso (um dia só) e reposição contam à parte, e só os que vêm pela frente', () => {
    const r = alunosDaTurma(
      [
        m({ data_inicio: '2026-10-20', data_fim: '2026-10-20' }),
        m({ data_inicio: '2026-11-03', data_fim: '2026-11-03' }),
        m({ flag_reposicao: true, data_inicio: '2026-11-03', data_fim: '2026-11-03' }),
        m({ flag_reposicao: true, data_inicio: '2026-10-20', data_fim: '2026-10-20' }),
      ],
      HOJE,
    )
    expect(r).toEqual({ fixos: 0, avulsos: 1, reposicoes: 1 })
  })
})
