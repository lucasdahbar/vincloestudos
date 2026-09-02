import 'server-only'
import { clienteServidor } from './cliente'

const SELECT_MATRICULA = `
  id, data_inicio, data_fim, flag_reposicao, status, aluno_id, turma_id,
  aluno:alunos!aluno_id (id, nome, ativo),
  turma:turmas!turma_id (id, nome, status)
`

export interface MatriculaComRelacoes {
  id: number
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
  status: 'Ativa' | 'Encerrada'
  aluno_id: number
  turma_id: number
  aluno: { id: number; nome: string; ativo: boolean } | null
  turma: { id: number; nome: string; status: string } | null
}

export async function listarMatriculas(filtros: {
  alunoId?: number
  turmaId?: number
  status?: string
} = {}): Promise<MatriculaComRelacoes[]> {
  const supabase = await clienteServidor()
  let consulta = supabase.from('matriculas').select(SELECT_MATRICULA)

  if (filtros.alunoId) consulta = consulta.eq('aluno_id', filtros.alunoId)
  if (filtros.turmaId) consulta = consulta.eq('turma_id', filtros.turmaId)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)

  const { data, error } = await consulta.order('data_inicio', { ascending: false })
  if (error) throw new Error(`Falha ao listar matrículas: ${error.message}`)
  return (data ?? []) as unknown as MatriculaComRelacoes[]
}

export interface MatriculaParaEditar {
  id: number
  aluno_id: number
  turma_id: number
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
  status: 'Ativa' | 'Encerrada'
  aluno_nome: string
  turma_nome: string
}

/** T3: a matricula de um aluno numa turma, para a tela de edicao. */
export async function obterMatricula(id: number): Promise<MatriculaParaEditar | null> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('matriculas')
    .select('id, aluno_id, turma_id, data_inicio, data_fim, flag_reposicao, status, aluno:alunos!aluno_id (nome), turma:turmas!turma_id (nome)')
    .eq('id', id)
    .maybeSingle()

  if (!data) return null

  const aluno = data.aluno as unknown as { nome: string } | null
  const turma = data.turma as unknown as { nome: string } | null

  return {
    id: data.id,
    aluno_id: data.aluno_id,
    turma_id: data.turma_id,
    data_inicio: String(data.data_inicio).slice(0, 10),
    data_fim: data.data_fim ? String(data.data_fim).slice(0, 10) : null,
    flag_reposicao: data.flag_reposicao,
    status: data.status,
    aluno_nome: aluno?.nome ?? 'Aluno',
    turma_nome: turma?.nome ?? 'Turma',
  }
}

/** T3: qual matricula liga este aluno a esta turma, para a navegacao da turma. */
export async function matriculaDoAlunoNaTurma(
  alunoId: number,
  turmaId: number,
): Promise<number | null> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('matriculas')
    .select('id')
    .eq('aluno_id', alunoId)
    .eq('turma_id', turmaId)
    .order('data_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}
