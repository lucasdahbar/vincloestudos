import { describe, expect, it } from 'vitest'
import { comoDesmatricular, mandaBoasVindas, matriculaParaAntecipar, validarMatricula, type EntradaMatricula, type TurmaDaMatricula } from './regras'

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

describe('comoDesmatricular', () => {
  const hoje = '2026-11-03'
  const aberta = { data_inicio: '2026-10-01', data_fim: null }
  const sair = (saida: string, chamadas: string[] = [], m: { data_inicio: string; data_fim: string | null } = aberta) =>
    comoDesmatricular(m, { saida, hoje, chamadasDoAluno: chamadas })

  it('saindo hoje, a matricula termina ontem e ja fica encerrada', () => {
    expect(sair(hoje)).toEqual({ acao: 'encerrar', data_fim: '2026-11-02', status: 'Encerrada' })
  })

  it('saindo numa data futura, continua ativa ate a vespera', () => {
    expect(sair('2026-11-20')).toEqual({ acao: 'encerrar', data_fim: '2026-11-19', status: 'Ativa' })
  })

  it('saindo amanha, ainda faz a aula de hoje', () => {
    expect(sair('2026-11-04')).toEqual({ acao: 'encerrar', data_fim: hoje, status: 'Ativa' })
  })

  it('aceita uma data no passado sem chamada dele depois', () => {
    expect(sair('2026-10-20', ['2026-10-13'])).toEqual({ acao: 'encerrar', data_fim: '2026-10-19', status: 'Encerrada' })
  })

  it('recusa a data se ja houve chamada dele nela ou depois', () => {
    const r = sair('2026-10-20', ['2026-10-13', '2026-10-20', '2026-10-27'])
    expect(r.acao).toBe('recusar')
    expect(r.acao === 'recusar' && r.motivo).toContain('27/10')
    expect(r.acao === 'recusar' && r.motivo).toContain('28/10')
  })

  it('ignora chamada fora desta matricula', () => {
    const m = { data_inicio: '2026-10-01', data_fim: '2026-10-31' }
    expect(sair('2026-10-20', ['2026-11-10'], m)).toEqual({ acao: 'encerrar', data_fim: '2026-10-19', status: 'Encerrada' })
  })

  it('exclui a matricula que nao chega a ter nenhum dia antes da saida', () => {
    expect(sair('2026-10-01')).toEqual({ acao: 'excluir' })
    expect(sair(hoje, [], { data_inicio: '2026-11-10', data_fim: null })).toEqual({ acao: 'excluir' })
  })

  it('recusa a saida depois do fim que a matricula ja tem', () => {
    const r = sair('2026-12-10', [], { data_inicio: '2026-10-01', data_fim: '2026-11-30' })
    expect(r.acao).toBe('recusar')
    expect(r.acao === 'recusar' && r.motivo).toContain('30/11')
  })

  it('recusa data vazia', () => {
    expect(sair('').acao).toBe('recusar')
  })
})

describe('matriculaParaAntecipar', () => {
  const futura = { id: 131, data_inicio: '2026-10-19', data_fim: null }
  const nova = { ...matriculaValida, data_inicio: '2026-10-15', data_fim: '2026-10-15' }

  it('sugere antecipar a matricula futura do mesmo aluno na turma', () => {
    expect(matriculaParaAntecipar(nova, [futura])).toEqual(futura)
  })

  it('sugere tambem quando a nova seria em aberto', () => {
    expect(matriculaParaAntecipar({ ...nova, data_fim: null }, [futura])).toEqual(futura)
  })

  it('escolhe a matricula futura mais proxima', () => {
    const depois = { id: 140, data_inicio: '2027-02-01', data_fim: null }
    const antes = { id: 131, data_inicio: '2026-10-19', data_fim: '2026-12-15' }
    expect(matriculaParaAntecipar(nova, [depois, antes])).toEqual(antes)
  })

  it('nao sugere quando a outra matricula ja comecou', () => {
    expect(matriculaParaAntecipar(nova, [{ id: 1, data_inicio: '2026-09-01', data_fim: '2026-09-30' }])).toBeNull()
  })

  it('nao sugere para matricula de reposicao, que e separada de proposito', () => {
    expect(matriculaParaAntecipar({ ...nova, flag_reposicao: true }, [futura])).toBeNull()
  })

  it('nao sugere ao editar uma matricula', () => {
    expect(matriculaParaAntecipar({ ...nova, id: 200 }, [futura])).toBeNull()
  })

  it('nao sugere quando antecipar invadiria outra matricula', () => {
    const passada = { id: 120, data_inicio: '2026-10-01', data_fim: '2026-10-16' }
    expect(matriculaParaAntecipar(nova, [passada, futura])).toBeNull()
  })
})

describe('mandaBoasVindas', () => {
  it('manda para a matricula comum, em aberto ou com fim', () => {
    expect(mandaBoasVindas({ flag_reposicao: false, data_inicio: '2026-10-15', data_fim: null })).toBe(true)
    expect(mandaBoasVindas({ flag_reposicao: false, data_inicio: '2026-10-15', data_fim: '2026-12-15' })).toBe(true)
  })

  it('nao manda para a aula avulsa, de um dia so', () => {
    expect(mandaBoasVindas({ flag_reposicao: false, data_inicio: '2026-10-15', data_fim: '2026-10-15' })).toBe(false)
  })

  it('nao manda para a reposicao', () => {
    expect(mandaBoasVindas({ flag_reposicao: true, data_inicio: '2026-10-15', data_fim: null })).toBe(false)
  })
})
