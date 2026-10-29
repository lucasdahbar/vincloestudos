import { describe, expect, it } from 'vitest'
import {
  avaliarEncerramento,
  dataDoEncerramento,
  type SituacaoEncerramento,
} from './encerramento'

const aula = (data: string, over: Partial<SituacaoEncerramento['aulas'][number]> = {}) => ({
  data,
  status: 'Agendada' as const,
  temPresenca: false,
  ...over,
})

// Turma de quarta, de 07/10 em diante; aula de 07/10 ja dada.
const turma = (over: Partial<SituacaoEncerramento> = {}): SituacaoEncerramento => ({
  tipo_recorrencia: 'Recorrente',
  data_inicio: '2026-10-07',
  data_fim: '2026-12-31',
  data_unica: null,
  aulas: [aula('2026-10-07', { status: 'Realizada', temPresenca: true }), aula('2026-10-14'), aula('2026-10-21')],
  matriculasAtivas: 2,
  reposicoesChegando: [],
  cobrancas: [],
  ...over,
})

describe('dataDoEncerramento', () => {
  it('recorrente usa a data informada', () => {
    expect(dataDoEncerramento(turma(), '2026-10-14')).toBe('2026-10-14')
  })

  it('recorrente sem data informada não tem data', () => {
    expect(dataDoEncerramento(turma(), null)).toBeNull()
  })

  it('aula única que não aconteceu: a data é a da aula, que sai', () => {
    const unica = turma({
      tipo_recorrencia: 'Único',
      data_inicio: null,
      data_fim: null,
      data_unica: '2026-10-20',
      aulas: [aula('2026-10-20')],
    })
    expect(dataDoEncerramento(unica, '2026-12-01')).toBe('2026-10-20')
  })

  it('aula única que já aconteceu: nada sai', () => {
    const unica = turma({
      tipo_recorrencia: 'Único',
      data_inicio: null,
      data_fim: null,
      data_unica: '2026-10-07',
      aulas: [aula('2026-10-07', { status: 'Realizada', temPresenca: true })],
    })
    expect(dataDoEncerramento(unica, null)).toBe('2026-10-08')
  })
})

describe('avaliarEncerramento', () => {
  it('sem nada depois da data: encerra e conta o que acontece', () => {
    const r = avaliarEncerramento(turma(), '2026-10-14')
    expect(r).toEqual({
      pode: true,
      vespera: '2026-10-13',
      alunos: 2,
      aulasQueSaem: 2,
      itensDeRascunho: 0,
    })
  })

  it('aula já dada depois da data bloqueia e diz a primeira data possível', () => {
    const r = avaliarEncerramento(turma(), '2026-10-07')
    expect(r.pode).toBe(false)
    if (!r.pode) {
      expect(r.motivos[0]).toContain('07/10/2026 já aconteceu')
      expect(r.motivos[0]).toContain('08/10/2026')
    }
  })

  it('não encerra no primeiro dia da turma ou antes', () => {
    const r = avaliarEncerramento(turma({ aulas: [] }), '2026-10-07')
    expect(r.pode).toBe(false)
    if (!r.pode) expect(r.motivos[0]).toContain('Excluir turma')
  })

  it('data depois do fim atual estenderia a turma: bloqueia', () => {
    const r = avaliarEncerramento(turma(), '2027-03-01')
    expect(r.pode).toBe(false)
    if (!r.pode) expect(r.motivos[0]).toContain('até 01/01/2027')
  })

  it('o dia seguinte ao fim atual ainda vale (turma que já terminou)', () => {
    expect(avaliarEncerramento(turma(), '2027-01-01').pode).toBe(true)
  })

  it('reposição de outra turma marcada depois da data bloqueia', () => {
    const r = avaliarEncerramento(
      turma({ reposicoesChegando: [{ aluno: 'Davi', data: '2026-10-21' }] }),
      '2026-10-14',
    )
    expect(r.pode).toBe(false)
    if (!r.pode) expect(r.motivos).toContain('Davi tem reposição marcada em 21/10/2026: remarque antes.')
  })

  it('com a prévia (etapa 6c), reposição chegando e cobrança confirmada não bloqueiam: a prévia resolve', () => {
    const s = turma({
      reposicoesChegando: [{ aluno: 'Davi', data: '2026-10-21' }],
      cobrancas: [{ aluno: 'Ana', data: '2026-10-21', confirmada: true, temReposicao: false }],
    })
    expect(avaliarEncerramento(s, '2026-10-14', { resolvidoNaPrevia: true }).pode).toBe(true)
    // As outras travas continuam.
    expect(avaliarEncerramento(s, '2026-10-07', { resolvidoNaPrevia: true }).pode).toBe(false)
  })

  it('reposição antes da data não atrapalha', () => {
    const r = avaliarEncerramento(
      turma({ reposicoesChegando: [{ aluno: 'Davi', data: '2026-10-14' }] }),
      '2026-10-21',
    )
    expect(r.pode).toBe(true)
  })

  it('cobrança em rascunho não bloqueia: os itens saem', () => {
    const r = avaliarEncerramento(
      turma({
        cobrancas: [
          { aluno: 'Ana', data: '2026-10-14', confirmada: false, temReposicao: false },
          { aluno: 'Ana', data: '2026-10-21', confirmada: false, temReposicao: false },
        ],
      }),
      '2026-10-14',
    )
    expect(r.pode && r.itensDeRascunho).toBe(2)
  })

  it('cobrança confirmada sem reposição bloqueia e diz quem e quando', () => {
    const r = avaliarEncerramento(
      turma({ cobrancas: [{ aluno: 'Ana', data: '2026-10-21', confirmada: true, temReposicao: false }] }),
      '2026-10-14',
    )
    expect(r.pode).toBe(false)
    if (!r.pode) {
      expect(r.motivos[0]).toContain('Ana em 21/10/2026')
      expect(r.motivos[0]).toContain('reposição')
    }
  })

  it('cobrança confirmada com reposição já registrada libera', () => {
    const r = avaliarEncerramento(
      turma({ cobrancas: [{ aluno: 'Ana', data: '2026-10-21', confirmada: true, temReposicao: true }] }),
      '2026-10-14',
    )
    expect(r.pode).toBe(true)
  })

  it('cobrança confirmada antes da data não importa', () => {
    const r = avaliarEncerramento(
      turma({ cobrancas: [{ aluno: 'Ana', data: '2026-10-07', confirmada: true, temReposicao: false }] }),
      '2026-10-14',
    )
    expect(r.pode).toBe(true)
  })

  it('aula excluída não conta como aula que sai', () => {
    const r = avaliarEncerramento(
      turma({ aulas: [aula('2026-10-14', { status: 'Excluída' }), aula('2026-10-21')] }),
      '2026-10-14',
    )
    expect(r.pode && r.aulasQueSaem).toBe(1)
  })
})
