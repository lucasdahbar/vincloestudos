import type { StatusReposicao } from '@/dominio/reposicoes/agendamento'

export interface MatriculadoNaAula {
  aluno_id: number
  nome: string
  /** true quando o aluno esta na turma por matricula de reposicao. */
  flag_reposicao: boolean
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

/**
 * Quem faltou à própria reposição volta para a lista de pendentes (Julio,
 * 20/10/2026): a reposição não aconteceu, e a gestora remarca ou registra a
 * desistência. É a MESMA pendência, que guarda a decisão de cobrança e de
 * pagamento; faltar na reposição não abre uma segunda (ver `montarRegistro`).
 *
 * Vale para a primeira chamada e para a correção de uma presença que virou
 * falta. Desistida fica como está.
 */
export function reposicoesQueNaoAconteceram(
  /** As reposições marcadas PARA esta aula (a aula é a de destino). */
  reposicoes: { id: number; aluno_id: number; status: StatusReposicao }[],
  presencas: { aluno_id: number; presente: boolean }[],
): number[] {
  const faltaram = new Set(presencas.filter((p) => !p.presente).map((p) => p.aluno_id))
  return reposicoes
    .filter((r) => (r.status === 'Agendada' || r.status === 'Realizada') && faltaram.has(r.aluno_id))
    .map((r) => r.id)
}
