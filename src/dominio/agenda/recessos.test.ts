import { describe, expect, it } from 'vitest'
import { conflitosComRecesso, type AulaComEscola, type RecessoEscolar } from './recessos'

const RECESSO_SAO_JOSE: RecessoEscolar = {
  escola_id: 1,
  descricao: 'Recesso de julho',
  data_inicio: '2026-07-06',
  data_fim: '2026-07-24',
}

const aula = (over: Partial<AulaComEscola> = {}): AulaComEscola => ({
  id: 1,
  data: '2026-07-10',
  status: 'Agendada',
  escola_id: 1,
  ...over,
})

describe('conflitosComRecesso', () => {
  it('acusa aula dentro do recesso da escola', () => {
    expect(conflitosComRecesso([aula()], [RECESSO_SAO_JOSE])).toEqual([
      { aulaId: 1, data: '2026-07-10', recesso: 'Recesso de julho' },
    ])
  })

  it('inclui os dois extremos do período', () => {
    const nas_pontas = [aula({ id: 1, data: '2026-07-06' }), aula({ id: 2, data: '2026-07-24' })]
    expect(conflitosComRecesso(nas_pontas, [RECESSO_SAO_JOSE])).toHaveLength(2)
  })

  it('ignora aula fora do período', () => {
    expect(conflitosComRecesso([aula({ data: '2026-07-25' })], [RECESSO_SAO_JOSE])).toEqual([])
  })

  it('recesso é de UMA escola: turma de outra escola não é afetada', () => {
    expect(conflitosComRecesso([aula({ escola_id: 2 })], [RECESSO_SAO_JOSE])).toEqual([])
  })

  it('turma sem escola nunca cai em recesso', () => {
    // Aula particular não segue calendário de escola nenhuma.
    expect(conflitosComRecesso([aula({ escola_id: null })], [RECESSO_SAO_JOSE])).toEqual([])
  })

  it('não repete a aula quando dois recessos se sobrepõem', () => {
    const outro: RecessoEscolar = { ...RECESSO_SAO_JOSE, descricao: 'Semana de provas' }
    expect(conflitosComRecesso([aula()], [RECESSO_SAO_JOSE, outro])).toHaveLength(1)
  })

  it('só relata o que ainda tem decisão pendente', () => {
    const resolvidas = [
      aula({ id: 1, status: 'Cancelada' }),
      aula({ id: 2, status: 'Realizada' }),
      aula({ id: 3, status: 'Feriado' }),
    ]
    expect(conflitosComRecesso(resolvidas, [RECESSO_SAO_JOSE])).toEqual([])
  })

  it('sem recessos cadastrados não acusa nada', () => {
    expect(conflitosComRecesso([aula()], [])).toEqual([])
  })
})
