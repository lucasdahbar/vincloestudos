export interface MatriculadoNaAula {
  aluno_id: number
  nome: string
  /** true quando o aluno esta na turma por matricula de reposicao. */
  flag_reposicao: boolean
}

/**
 * R3 (Rodada 2): quem ja tem uma Pendencia de Reposicao em aberto para ESTA
 * aula sai da lista de matriculados dela — na agenda da gestora e no formulario
 * do professor. E o caso do aviso previo: o responsavel avisa antes que o aluno
 * nao vem, a gestora registra a pendencia, e o professor nem ve o nome para
 * marcar falta. O aluno passa a viver na area de Reposicoes ate ser resolvido.
 *
 * So pendencia EM ABERTO tira o aluno: uma ja agendada ou desistida e assunto
 * encerrado e nao deveria mexer na lista de outra aula.
 */
export function semPendenciaDeReposicao<T extends { aluno_id: number }>(
  matriculados: T[],
  pendentesNestaAula: { aluno_id: number }[],
): T[] {
  const fora = new Set(pendentesNestaAula.map((p) => p.aluno_id))
  return matriculados.filter((m) => !fora.has(m.aluno_id))
}

export interface RespostaChamada {
  aluno_id: number
  presente: boolean
  observacao?: string
}

export interface PresencaAGravar {
  aula_id: number
  aluno_id: number
  presente: boolean
  flag_reposicao: boolean
  registrado_por: number | null
  observacao: string | null
}

export interface PendenciaAGerar {
  aluno_id: number
  aula_origem_id: number
}

export interface ResultadoChamada {
  presencas: PresencaAGravar[]
  pendencias: PendenciaAGerar[]
  ausentes: { aluno_id: number; nome: string }[]
  novoStatusAula: 'Realizada'
}

interface Entrada {
  aulaId: number
  professorId: number | null
  matriculados: MatriculadoNaAula[]
  respostas: RespostaChamada[]
}

/**
 * Modulos Operacionais 5.2. Ao salvar o formulario, o sistema gera uma presenca
 * para CADA aluno matriculado — nao apenas para os que o professor tocou. O
 * formulario tem "Presente" como padrao, entao a ausencia de resposta significa
 * presente.
 *
 * Cada falta gera uma pendencia de reposicao, salvo quando o aluno esta naquela
 * aula por matricula de reposicao: faltar a uma reposicao nao gera outra.
 */
export function montarRegistro({
  aulaId,
  professorId,
  matriculados,
  respostas,
}: Entrada): ResultadoChamada {
  const porAluno = new Map(respostas.map((r) => [r.aluno_id, r]))

  const presencas: PresencaAGravar[] = matriculados.map((m) => {
    const resposta = porAluno.get(m.aluno_id)
    return {
      aula_id: aulaId,
      aluno_id: m.aluno_id,
      presente: resposta?.presente ?? true,
      flag_reposicao: m.flag_reposicao,
      registrado_por: professorId,
      observacao: resposta?.observacao?.trim() || null,
    }
  })

  const faltaram = presencas.filter((p) => !p.presente)

  return {
    presencas,
    pendencias: faltaram
      .filter((p) => !p.flag_reposicao)
      .map((p) => ({ aluno_id: p.aluno_id, aula_origem_id: aulaId })),
    ausentes: faltaram.map((p) => ({
      aluno_id: p.aluno_id,
      nome: matriculados.find((m) => m.aluno_id === p.aluno_id)!.nome,
    })),
    novoStatusAula: 'Realizada',
  }
}
