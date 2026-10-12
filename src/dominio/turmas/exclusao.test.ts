import { describe, expect, it } from 'vitest'
import { avaliarExclusaoTurma, type HistoricoDaTurma } from './exclusao'

const vazio: HistoricoDaTurma = {
  matriculasAtivas: 0,
  presencas: 0,
  reposicoes: 0,
  cobrancas: 0,
  pagamentos: 0,
}

describe('avaliarExclusaoTurma', () => {
  it('sem histórico pode excluir, mesmo com aulas geradas', () => {
    const r = avaliarExclusaoTurma(vazio)
    expect(r.podeExcluir).toBe(true)
    expect(r.motivo).toContain('Não tem como voltar atrás')
  })

  it('pagamento de professor bloqueia com a mensagem do financeiro', () => {
    const r = avaliarExclusaoTurma({ ...vazio, pagamentos: 1 })
    expect(r.podeExcluir).toBe(false)
    expect(r.motivo).toContain('pagamento de um professor')
  })

  it('matrícula ativa bloqueia', () => {
    const r = avaliarExclusaoTurma({ ...vazio, matriculasAtivas: 2 })
    expect(r.podeExcluir).toBe(false)
    expect(r.motivo).toContain('2 matrículas ativas')
    expect(r.motivo).toContain('Encerre a turma')
  })

  it('aluno desmatriculado sem histórico não segura a turma', () => {
    // Teste de 12/10/2026 (turma 88): matricula desfeita minutos depois,
    // sem presenca nem cobranca. O que contaria como historico ja e contado
    // a parte (presenca, reposicao, cobranca, pagamento).
    const r = avaliarExclusaoTurma(vazio)
    expect(r.podeExcluir).toBe(true)
  })

  it('lista tudo o que segura a turma', () => {
    const r = avaliarExclusaoTurma({ ...vazio, presencas: 1, reposicoes: 1, cobrancas: 3 })
    expect(r.motivo).toContain('1 presença registrada')
    expect(r.motivo).toContain('1 reposição')
    expect(r.motivo).toContain('3 aulas cobradas')
  })
})
