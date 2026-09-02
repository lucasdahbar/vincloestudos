import 'server-only'
import { clienteServidor } from './cliente'

const SELECT_TURMA = `
  id, nome, modalidade, tipo_recorrencia, data_unica,
  dias_semana, horario_inicio, horario_fim, status,
  google_calendar_event_id,
  servico_id, materia_id, escola_id, ano_escolar_id, professor_id,
  servico:servicos!servico_id (id, nome, permite_materia, permite_escola, valor_padrao),
  materia:materias!materia_id (id, nome),
  escola:escolas!escola_id (id, nome),
  ano_escolar:anos_escolares!ano_escolar_id (id, nome),
  professor:professores!professor_id (id, nome)
`

export interface TurmaComRelacoes {
  id: number
  nome: string
  modalidade: 'Presencial' | 'Online'
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_unica: string | null
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: 'Ativa' | 'Encerrada'
  google_calendar_event_id: string | null
  servico_id: number
  materia_id: number | null
  escola_id: number | null
  ano_escolar_id: number
  professor_id: number
  servico: { id: number; nome: string; permite_materia: boolean; permite_escola: boolean } | null
  materia: { id: number; nome: string } | null
  escola: { id: number; nome: string } | null
  ano_escolar: { id: number; nome: string } | null
  professor: { id: number; nome: string } | null
  alunos_matriculados?: number
}

/** T2: os filtros que a listagem de turmas oferece. */
export interface FiltrosDeTurma {
  professorId?: number
  status?: string
  materiaId?: number
  escolaId?: number
  modalidade?: string
}

export async function listarTurmas(
  filtros: FiltrosDeTurma = {},
): Promise<TurmaComRelacoes[]> {
  const supabase = await clienteServidor()
  let consulta = supabase.from('turmas').select(SELECT_TURMA)

  if (filtros.professorId) consulta = consulta.eq('professor_id', filtros.professorId)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)
  if (filtros.materiaId) consulta = consulta.eq('materia_id', filtros.materiaId)
  if (filtros.escolaId) consulta = consulta.eq('escola_id', filtros.escolaId)
  if (filtros.modalidade) consulta = consulta.eq('modalidade', filtros.modalidade)

  const { data, error } = await consulta.order('nome')
  if (error) throw new Error(`Falha ao listar turmas: ${error.message}`)

  const turmas = (data ?? []) as unknown as TurmaComRelacoes[]

  // Contagem de matriculas ativas e nao-reposicao, exibida na listagem.
  const { data: contagens } = await supabase
    .from('matriculas')
    .select('turma_id')
    .eq('status', 'Ativa')
    .eq('flag_reposicao', false)

  const porTurma = new Map<number, number>()
  for (const linha of contagens ?? []) {
    const id = (linha as { turma_id: number }).turma_id
    porTurma.set(id, (porTurma.get(id) ?? 0) + 1)
  }

  return turmas.map((t) => ({ ...t, alunos_matriculados: porTurma.get(t.id) ?? 0 }))
}

export async function obterTurma(id: number): Promise<TurmaComRelacoes | null> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase
    .from('turmas')
    .select(SELECT_TURMA)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Falha ao carregar turma: ${error.message}`)
  return (data ?? null) as unknown as TurmaComRelacoes | null
}

export interface OpcoesDeTurma {
  servicos: { id: number; nome: string; permite_materia: boolean; permite_escola: boolean }[]
  materias: { id: number; nome: string }[]
  escolas: { id: number; nome: string }[]
  anosEscolares: { id: number; nome: string }[]
  professores: { id: number; nome: string }[]
}

export async function opcoesDeTurma(): Promise<OpcoesDeTurma> {
  const supabase = await clienteServidor()
  const [servicos, materias, escolas, anos, professores] = await Promise.all([
    supabase.from('servicos').select('id, nome, permite_materia, permite_escola').eq('ativo', true).order('nome'),
    supabase.from('materias').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('escolas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('anos_escolares').select('id, nome').eq('ativo', true).order('ordem'),
    supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
  ])

  return {
    servicos: servicos.data ?? [],
    materias: materias.data ?? [],
    escolas: escolas.data ?? [],
    anosEscolares: anos.data ?? [],
    professores: professores.data ?? [],
  }
}
