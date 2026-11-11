import { describe, expect, it } from 'vitest'
import { trocasDaAulaUnica } from './aula-unica'

const turma = { tipo_recorrencia: 'Único', professor_id: 17, servico_id: 3, modalidade: 'Online' as const }
const aula = { professor_id: 17, servico_id: 3, modalidade: 'Online' as const }

describe('trocasDaAulaUnica', () => {
  it('a turma de aula única acompanha a troca de professor', () => {
    expect(trocasDaAulaUnica(turma, aula, { professorId: 2, servicoId: null, modalidade: null })).toEqual({
      aula: { professor_id: 2 },
      turma: { professor_id: 2 },
    })
  })

  it('aula já trocada e turma não (turma 321, 11/11/2026): troca só a turma', () => {
    const r = trocasDaAulaUnica(turma, { ...aula, professor_id: 2 }, { professorId: 2, servicoId: null, modalidade: null })
    expect(r).toEqual({ aula: {}, turma: { professor_id: 2 } })
  })

  it('serviço e modalidade também acompanham', () => {
    expect(trocasDaAulaUnica(turma, aula, { professorId: null, servicoId: 10, modalidade: 'Presencial' })).toEqual({
      aula: { servico_id: 10, modalidade: 'Presencial' },
      turma: { servico_id: 10, modalidade: 'Presencial' },
    })
  })

  it('turma recorrente não muda: só esta aula', () => {
    expect(
      trocasDaAulaUnica({ ...turma, tipo_recorrencia: 'Recorrente' }, aula, { professorId: 2, servicoId: null, modalidade: null }),
    ).toEqual({ aula: { professor_id: 2 }, turma: {} })
  })

  it('nada a mudar', () => {
    expect(trocasDaAulaUnica(turma, aula, { professorId: 17, servicoId: 3, modalidade: 'Online' })).toEqual({
      aula: {},
      turma: {},
    })
  })
})
