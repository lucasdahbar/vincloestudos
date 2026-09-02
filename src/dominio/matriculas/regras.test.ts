import { describe, expect, it } from 'vitest'
import { validarMatricula, type EntradaMatricula, type TurmaDaMatricula } from './regras'

const turmaAtiva: TurmaDaMatricula = { status: 'Ativa' }
const turmaEncerrada: TurmaDaMatricula = { status: 'Encerrada' }

const matriculaValida: EntradaMatricula = {
  aluno_id: 1,
  turma_id: 2,
  data_inicio: '2026-08-01',
  data_fim: null,
  flag_reposicao: false,
  alunoAtivo: true,
}

describe('validarMatricula', () => {
  it('aceita uma matricula valida em aberto', () => {
    expect(validarMatricula(matriculaValida, turmaAtiva)).toEqual([])
  })

  it('aceita data de fim posterior a de inicio', () => {
    const erros = validarMatricula({ ...matriculaValida, data_fim: '2026-12-15' }, turmaAtiva)
    expect(erros).toEqual([])
  })

  it('rejeita matricula em turma encerrada', () => {
    const erros = validarMatricula(matriculaValida, turmaEncerrada)
    expect(erros).toContain('Esta turma está encerrada e não aceita novas matrículas.')
  })

  it('rejeita data de fim anterior a de inicio', () => {
    const erros = validarMatricula({ ...matriculaValida, data_fim: '2026-07-01' }, turmaAtiva)
    expect(erros).toContain('A data de fim não pode ser anterior à data de início.')
  })

  // M2 (Rodada 2): a regra anterior era `>` e barrava o aluno que participa de
  // um unico aulao avulso — matricula que comeca e termina no mesmo dia.
  it('aceita matricula de um dia so', () => {
    const erros = validarMatricula({ ...matriculaValida, data_fim: '2026-08-01' }, turmaAtiva)
    expect(erros).toEqual([])
  })

  it('rejeita aluno inativo', () => {
    const erros = validarMatricula({ ...matriculaValida, alunoAtivo: false }, turmaAtiva)
    expect(erros).toContain('Este aluno está inativo.')
  })

  it('exige data de inicio', () => {
    const erros = validarMatricula({ ...matriculaValida, data_inicio: '' }, turmaAtiva)
    expect(erros).toContain('Informe a data de início.')
  })
})

describe('avisoDeReposicao', () => {
  it('avisa que matricula de reposicao nao gera cobranca', async () => {
    const { avisoDeReposicao } = await import('./regras')
    expect(avisoDeReposicao(true)).toBe(
      'Esta matrícula é apenas para uma reposição: ela não gera cobrança para o responsável.',
    )
    expect(avisoDeReposicao(false)).toBeNull()
  })
})

// M1 (Rodada 2): o mesmo aluno pode entrar e sair da mesma turma varias vezes,
// mas nunca ter dois periodos simultaneos nela.
describe('não sobreposição de períodos', () => {
  const SOBREPOSTA =
    'Este aluno já possui uma matrícula nesta turma no período informado. ' +
    'Encerre a matrícula atual antes de criar uma nova.'

  it('aceita matrículas sequenciais na mesma turma', () => {
    const erros = validarMatricula({ ...matriculaValida, data_inicio: '2026-08-01' }, turmaAtiva, [
      { id: 1, data_inicio: '2026-03-01', data_fim: '2026-07-31' },
    ])
    expect(erros).toEqual([])
  })

  it('rejeita período que invade uma matrícula existente', () => {
    const erros = validarMatricula({ ...matriculaValida, data_inicio: '2026-08-01' }, turmaAtiva, [
      { id: 1, data_inicio: '2026-03-01', data_fim: '2026-08-15' },
    ])
    expect(erros).toContain(SOBREPOSTA)
  })

  it('trata data de fim vazia como "não tem previsão de terminar"', () => {
    // A antiga esta em aberto: qualquer inicio posterior cai dentro dela.
    const erros = validarMatricula({ ...matriculaValida, data_inicio: '2027-01-01' }, turmaAtiva, [
      { id: 1, data_inicio: '2026-03-01', data_fim: null },
    ])
    expect(erros).toContain(SOBREPOSTA)
  })

  it('rejeita quando a nova é que está em aberto', () => {
    const erros = validarMatricula(
      { ...matriculaValida, data_inicio: '2026-01-01', data_fim: null },
      turmaAtiva,
      [{ id: 1, data_inicio: '2026-03-01', data_fim: '2026-04-01' }],
    )
    expect(erros).toContain(SOBREPOSTA)
  })

  it('encostar não é sobrepor: fim num dia, início no seguinte', () => {
    const erros = validarMatricula({ ...matriculaValida, data_inicio: '2026-08-02' }, turmaAtiva, [
      { id: 1, data_inicio: '2026-03-01', data_fim: '2026-08-01' },
    ])
    expect(erros).toEqual([])
  })

  it('editar a própria matrícula não conflita com ela mesma', () => {
    const erros = validarMatricula(
      { ...matriculaValida, id: 7, data_inicio: '2026-08-01', data_fim: '2026-09-01' },
      turmaAtiva,
      [{ id: 7, data_inicio: '2026-08-01', data_fim: null }],
    )
    expect(erros).toEqual([])
  })

  it('mas uma edição não pode passar por cima de outra matrícula', () => {
    const erros = validarMatricula(
      { ...matriculaValida, id: 7, data_inicio: '2026-08-01', data_fim: '2026-12-01' },
      turmaAtiva,
      [
        { id: 7, data_inicio: '2026-08-01', data_fim: '2026-09-01' },
        { id: 9, data_inicio: '2026-10-01', data_fim: null },
      ],
    )
    expect(erros).toContain(SOBREPOSTA)
  })
})
