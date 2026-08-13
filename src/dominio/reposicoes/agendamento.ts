export type StatusReposicao = 'Pendente' | 'Agendada' | 'Realizada' | 'Desistida'

export interface Pendencia {
  id: number
  aluno_id: number
  aula_origem_id: number
  turma_origem_id: number
  status: StatusReposicao
}

export interface AulaDestino {
  id: number
  turma_id: number
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
}

export interface MatriculaExistente {
  aluno_id: number
  turma_id: number
}

export interface PlanoReposicao {
  erros: string[]
  precisaMatricula: boolean
  matricula: { aluno_id: number; turma_id: number; flag_reposicao: true } | null
  /** Sempre false: a reposicao nunca gera cobranca (Operacionais 5.4). */
  geraCobranca: false
}

/**
 * Modulos Operacionais 5.4. A gestora indica em qual aula o aluno fara a
 * reposicao — em geral na mesma turma, mas pode ser em outra. Quando e em outra,
 * o sistema cria uma matricula com flag_reposicao para permitir o registro de
 * presenca; essa matricula nunca entra na base de calculo de cobranca.
 */
export function planejarReposicao(
  pendencia: Pendencia,
  destino: AulaDestino,
  matriculasDoAluno: MatriculaExistente[],
): PlanoReposicao {
  const erros: string[] = []

  if (pendencia.status === 'Realizada' || pendencia.status === 'Desistida') {
    erros.push('Esta reposição já foi encerrada.')
  }

  if (destino.id === pendencia.aula_origem_id) {
    erros.push('A reposição não pode ser na mesma aula em que houve a falta.')
  }

  if (destino.status === 'Cancelada') {
    erros.push('Esta aula está cancelada. Escolha outra.')
  }

  const jaMatriculado = matriculasDoAluno.some(
    (m) => m.aluno_id === pendencia.aluno_id && m.turma_id === destino.turma_id,
  )
  const outraTurma = destino.turma_id !== pendencia.turma_origem_id
  const precisaMatricula = erros.length === 0 && outraTurma && !jaMatriculado

  return {
    erros,
    precisaMatricula,
    matricula: precisaMatricula
      ? { aluno_id: pendencia.aluno_id, turma_id: destino.turma_id, flag_reposicao: true }
      : null,
    geraCobranca: false,
  }
}

/** O aluno pode desistir da reposicao enquanto ela nao aconteceu. */
export function validarDesistencia(pendencia: Pendencia): string[] {
  return pendencia.status === 'Realizada' ? ['Esta reposição já foi realizada.'] : []
}
