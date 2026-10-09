import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatusReposicao } from '@/dominio/reposicoes/agendamento'

/**
 * A lista de alunos de uma aula, num lugar só.
 *
 * Eram três cópias — a agenda da gestora, o link permanente do professor e o
 * link avulso da aula —, e elas já divergiam: o link avulso nem tirava da
 * chamada quem tinha avisado que não vinha, e gravava "presente" por padrão
 * para esse aluno.
 *
 * Rodada 3 (regra de 09/10/2026): quem avisou que não vem CONTINUA na lista,
 * marcado e sem presença nem falta — a aula não conta para o professor. Antes
 * ele sumia. Vale qualquer que tenha sido o destino da reposição depois.
 */

export interface AlunoDaAula {
  aluno_id: number
  nome: string
  /** Está nesta aula como reposição de outra. */
  flag_reposicao: boolean
}

export interface AvisoDaAula extends AlunoDaAula {
  pendencia_id: number
  status: StatusReposicao
}

export interface ListaDaAula {
  /** Entram na chamada. */
  chamada: AlunoDaAula[]
  /** Avisaram que não vêm: aparecem, mas sem presença nem falta. */
  avisaram: AvisoDaAula[]
}

export async function montarListaDaAula(
  db: SupabaseClient,
  aula: { id: number; turma_id: number; data_hora_inicio: string },
): Promise<ListaDaAula> {
  const dia = String(aula.data_hora_inicio).slice(0, 10)

  const [{ data: matriculas }, { data: avisos }] = await Promise.all([
    db
      .from('matriculas')
      .select('aluno_id, flag_reposicao, data_fim, aluno:alunos!aluno_id (nome)')
      .eq('turma_id', aula.turma_id)
      .eq('status', 'Ativa')
      .lte('data_inicio', dia),
    db
      .from('pendencias_reposicao')
      .select('id, aluno_id, status')
      .eq('aula_origem_id', aula.id)
      .eq('origem', 'Aviso'),
  ])

  const todos: AlunoDaAula[] = ((matriculas ?? []) as unknown as {
    aluno_id: number
    flag_reposicao: boolean
    data_fim: string | null
    aluno: { nome: string } | null
  }[])
    .filter((m) => !m.data_fim || m.data_fim >= dia)
    .map((m) => ({
      aluno_id: m.aluno_id,
      nome: m.aluno?.nome ?? 'Aluno removido',
      flag_reposicao: m.flag_reposicao,
    }))

  const porAluno = new Map(
    ((avisos ?? []) as { id: number; aluno_id: number; status: StatusReposicao }[]).map((a) => [
      a.aluno_id,
      a,
    ]),
  )

  return {
    chamada: todos.filter((m) => !porAluno.has(m.aluno_id)),
    avisaram: todos
      .filter((m) => porAluno.has(m.aluno_id))
      .map((m) => ({
        ...m,
        pendencia_id: porAluno.get(m.aluno_id)!.id,
        status: porAluno.get(m.aluno_id)!.status,
      })),
  }
}

/**
 * Quem esteve presente numa aula como reposição tem a reposição concluída.
 *
 * Antes nada marcava a pendência como Realizada: ela ficava Agendada para
 * sempre, mesmo depois de o aluno vir. Falta na reposição não conclui — a
 * pendência continua Agendada, para a gestora remarcar ou registrar desistência.
 */
export async function concluirReposicoes(
  db: SupabaseClient,
  aulaId: number,
  presencas: { aluno_id: number; presente: boolean }[],
): Promise<void> {
  // Pela pendencia que aponta para esta aula, nao pela marca da matricula: a
  // reposicao pode ser numa turma em que o aluno ja estava, sem matricula de
  // reposicao.
  const vieram = presencas.filter((p) => p.presente).map((p) => p.aluno_id)
  if (vieram.length === 0) return

  await db
    .from('pendencias_reposicao')
    .update({ status: 'Realizada' })
    .eq('aula_reposicao_id', aulaId)
    .eq('status', 'Agendada')
    .in('aluno_id', vieram)
}
