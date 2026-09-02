import type { StatusTurma } from '@/dominio/tipos'

export interface TurmaDaMatricula {
  status: StatusTurma
}

/** Uma matricula que ja existe para o mesmo par (aluno, turma). */
export interface PeriodoMatriculado {
  id: number | null
  data_inicio: string
  data_fim: string | null
}

export interface EntradaMatricula {
  aluno_id: number | null
  turma_id: number | null
  /** Datas em ISO (AAAA-MM-DD), comparaveis lexicograficamente. */
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
  alunoAtivo: boolean
  /** Quando esta editando, o id da propria matricula: ela nao conflita consigo. */
  id?: number | null
}

/** Modulos Operacionais, secao 3.2. */
export function validarMatricula(
  matricula: EntradaMatricula,
  turma: TurmaDaMatricula,
  /** M1: as outras matriculas do mesmo aluno na mesma turma. */
  jaMatriculado: PeriodoMatriculado[] = [],
): string[] {
  const erros: string[] = []

  if (matricula.aluno_id === null) erros.push('Selecione o aluno.')
  if (matricula.turma_id === null) erros.push('Selecione a turma.')
  if (!matricula.alunoAtivo) erros.push('Este aluno está inativo.')

  if (turma.status !== 'Ativa') {
    erros.push('Esta turma está encerrada e não aceita novas matrículas.')
  }

  if (matricula.data_inicio === '') {
    erros.push('Informe a data de início.')
  } else {
    // M2: a regra antiga era `>`, que barrava a matricula de um dia so — o
    // aluno que participa de um unico aulao avulso.
    if (matricula.data_fim !== null && matricula.data_fim < matricula.data_inicio) {
      erros.push('A data de fim não pode ser anterior à data de início.')
    }

    if (seSobrepoe(matricula, jaMatriculado)) {
      erros.push(
        'Este aluno já possui uma matrícula nesta turma no período informado. ' +
          'Encerre a matrícula atual antes de criar uma nova.',
      )
    }
  }

  return erros
}

/**
 * M1: o mesmo aluno pode entrar e sair da mesma turma varias vezes ao longo do
 * tempo, mas nunca ter dois periodos simultaneos nela.
 *
 * Data de fim vazia significa "sem data prevista para terminar": para efeito da
 * comparacao, o periodo vai ate o infinito.
 */
export function seSobrepoe(
  matricula: EntradaMatricula,
  jaMatriculado: PeriodoMatriculado[],
): boolean {
  const SEM_FIM = '9999-12-31'
  const inicio = matricula.data_inicio
  const fim = matricula.data_fim ?? SEM_FIM

  return jaMatriculado.some((outra) => {
    if (matricula.id != null && outra.id === matricula.id) return false
    return inicio <= (outra.data_fim ?? SEM_FIM) && outra.data_inicio <= fim
  })
}

/**
 * Secao 3.3: o formulario exibe um aviso quando a matricula e de reposicao,
 * porque a consequencia (nao gerar cobranca) nao e obvia pelo nome do campo.
 */
export function avisoDeReposicao(flagReposicao: boolean): string | null {
  return flagReposicao
    ? 'Esta matrícula é apenas para uma reposição: ela não gera cobrança para o responsável.'
    : null
}
