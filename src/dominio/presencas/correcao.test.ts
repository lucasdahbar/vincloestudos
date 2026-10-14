import { describe, expect, it } from 'vitest'
import {
  planejarCorrecao,
  type PendenciaDaAula,
  type PresencaAtual,
  type ReposicaoNaAula,
} from './correcao'

const atual = (over: Partial<PresencaAtual> = {}): PresencaAtual => ({
  aluno_id: 1,
  nome: 'Ana',
  presente: true,
  conta_pagar_id: null,
  ...over,
})

const pendencia = (over: Partial<PendenciaDaAula> = {}): PendenciaDaAula => ({
  id: 10,
  aluno_id: 1,
  origem: 'Falta',
  status: 'Pendente',
  temCredito: false,
  pagoAoProfessor: false,
  ...over,
})

const plano = (
  atuais: PresencaAtual[],
  novas: { aluno_id: number; presente: boolean }[],
  pendencias: PendenciaDaAula[] = [],
  reposicoes: ReposicaoNaAula[] = [],
) => planejarCorrecao({ atuais, novas, pendencias, reposicoes })

describe('planejarCorrecao', () => {
  it('primeira chamada: nada a desfazer', () => {
    expect(plano([], [{ aluno_id: 1, presente: false }])).toEqual({
      erros: [],
      removerPendencias: [],
      reabrirReposicoes: [],
    })
  })

  it('chamada igual à que já estava: nada muda', () => {
    expect(plano([atual()], [{ aluno_id: 1, presente: true }])).toEqual({
      erros: [],
      removerPendencias: [],
      reabrirReposicoes: [],
    })
  })

  it('falta corrigida para presença: a reposição que a falta gerou sai', () => {
    const r = plano(
      [atual({ presente: false })],
      [{ aluno_id: 1, presente: true }],
      [pendencia()],
    )
    expect(r.erros).toEqual([])
    expect(r.removerPendencias).toEqual([10])
  })

  it('falta corrigida, mas a reposição já foi marcada: bloqueia e manda para Reposições', () => {
    const r = plano(
      [atual({ presente: false })],
      [{ aluno_id: 1, presente: true }],
      [pendencia({ status: 'Agendada' })],
    )
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0]).toContain('Ana')
    expect(r.erros[0]).toContain('Reposições')
    expect(r.removerPendencias).toEqual([])
  })

  it('falta corrigida, mas a gestora já decidiu sobre a cobrança: bloqueia', () => {
    const r = plano(
      [atual({ presente: false })],
      [{ aluno_id: 1, presente: true }],
      [pendencia({ status: 'Desistida' })],
    )
    expect(r.erros).toHaveLength(1)
  })

  it('falta corrigida, mas já gerou crédito ou entrou no pagamento do professor: bloqueia', () => {
    const base = { atuais: [atual({ presente: false })], novas: [{ aluno_id: 1, presente: true }] }
    expect(plano(base.atuais, base.novas, [pendencia({ temCredito: true })]).erros).toHaveLength(1)
    expect(plano(base.atuais, base.novas, [pendencia({ pagoAoProfessor: true })]).erros).toHaveLength(1)
  })

  it('presença corrigida para falta: nada a remover (a gravação cria a reposição)', () => {
    const r = plano([atual()], [{ aluno_id: 1, presente: false }])
    expect(r).toEqual({ erros: [], removerPendencias: [], reabrirReposicoes: [] })
  })

  it('quem repunha e passa a faltar: a reposição concluída volta a marcada', () => {
    const r = plano(
      [atual()],
      [{ aluno_id: 1, presente: false }],
      [],
      [{ id: 20, aluno_id: 1, status: 'Realizada' }],
    )
    expect(r.reabrirReposicoes).toEqual([20])
  })

  it('reposição ainda marcada não precisa voltar', () => {
    const r = plano(
      [atual()],
      [{ aluno_id: 1, presente: false }],
      [],
      [{ id: 20, aluno_id: 1, status: 'Agendada' }],
    )
    expect(r.reabrirReposicoes).toEqual([])
  })

  it('pagamento do professor já fechado: não dá para corrigir', () => {
    const r = plano(
      [atual({ conta_pagar_id: 5 }), atual({ aluno_id: 2, nome: 'Bia' })],
      [{ aluno_id: 1, presente: false }],
    )
    expect(r.erros).toEqual([
      'O pagamento do professor desta aula já foi fechado: não dá para corrigir a chamada.',
    ])
  })

  it('aviso de ausência não é falta: a correção não mexe nele', () => {
    const r = plano(
      [atual({ presente: false })],
      [{ aluno_id: 1, presente: true }],
      [pendencia({ origem: 'Aviso' })],
    )
    expect(r.removerPendencias).toEqual([])
    expect(r.erros).toEqual([])
  })

  it('só mexe em quem mudou', () => {
    const r = plano(
      [atual({ presente: false }), atual({ aluno_id: 2, nome: 'Bia', presente: false })],
      [
        { aluno_id: 1, presente: true },
        { aluno_id: 2, presente: false },
      ],
      [pendencia(), pendencia({ id: 11, aluno_id: 2 })],
    )
    expect(r.removerPendencias).toEqual([10])
  })
})
