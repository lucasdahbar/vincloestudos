import { describe, expect, it } from 'vitest'
import { camposAnonimizados, decidirExclusao } from './exclusao'

describe('decidirExclusao', () => {
  it('apaga de vez quando não há nada vinculado', () => {
    const d = decidirExclusao({ financeiros: 0, operacionais: 0 })
    expect(d.acao).toBe('excluir')
  })

  it('anonimiza quando há registro financeiro', () => {
    // A contabilidade nao pode perder o historico (Secoes 4.4 e 5.7).
    const d = decidirExclusao({ financeiros: 3, operacionais: 0 })
    expect(d.acao).toBe('anonimizar')
    expect(d.motivo).toContain('3 registro')
    expect(d.motivo).toContain('preservado')
  })

  it('anonimiza quando há aulas ou matrículas, mesmo sem financeiro', () => {
    const d = decidirExclusao({ financeiros: 0, operacionais: 5 })
    expect(d.acao).toBe('anonimizar')
    expect(d.motivo).toContain('aulas ou matrículas')
  })

  it('o financeiro tem precedência na explicação', () => {
    const d = decidirExclusao({ financeiros: 2, operacionais: 9 })
    expect(d.motivo).toContain('financeiro')
  })
})

describe('camposAnonimizados', () => {
  it('apaga nome, telefone e e-mail, e desativa', () => {
    const c = camposAnonimizados('responsaveis', 7)
    expect(c.nome).toBe('Responsável removido #7')
    expect(c.telefone).toBeNull()
    expect(c.email).toBeNull()
    expect(c.ativo).toBe(false)
  })

  it('apaga o endereço completo do responsável', () => {
    const c = camposAnonimizados('responsaveis', 7)
    for (const campo of ['cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'estado']) {
      expect(c[campo]).toBeNull()
    }
  })

  it('apaga a chave Pix do professor', () => {
    const c = camposAnonimizados('professores', 2)
    expect(c.nome).toBe('Professor removido #2')
    expect(c.chave_pix).toBeNull()
  })

  it('não mexe no percentual de repasse, que o histórico financeiro usa', () => {
    expect('percentual_repasse' in camposAnonimizados('professores', 2)).toBe(false)
  })

  it('apaga data de nascimento do aluno', () => {
    const c = camposAnonimizados('alunos', 5)
    expect(c.nome).toBe('Aluno removido #5')
    expect(c.data_nascimento).toBeNull()
  })

  it('não mexe no vínculo com o responsável, que a cobrança usa', () => {
    expect('responsavel_id' in camposAnonimizados('alunos', 5)).toBe(false)
  })
})
