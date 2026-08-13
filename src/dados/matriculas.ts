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
