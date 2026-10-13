import 'server-only'
import { clienteServidor } from './cliente'
import { rotuloDaTurma } from '@/dominio/turmas/quando'
import { calendarioEscolar } from './calendario'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import type { Feriado } from '@/dominio/agenda/feriados'
import type { RecessoEscolar } from '@/dominio/agenda/recessos'
import type { Frequencia } from '@/dominio/tipos'

const SELECT_TURMA = `
  id, nome, modalidade, tipo_recorrencia, data_unica,
  frequencia, intervalo, data_inicio, data_fim, fim_automatico,
  dias_semana, horario_inicio, horario_fim, status,
  google_calendar_event_id, link_videochamada,
  servico_id, materia_id, escola_id, ano_escolar_id, professor_id,
  servico:servicos!servico_id (id, nome, permite_materia, permite_escola, valor_padrao),
  materia:materias!materia_id (id, nome),
  escola:escolas!escola_id (id, nome),
  ano_escolar:anos_escolares!ano_escolar_id (id, nome),
  professor:professores!professor_id (id, nome, google_calendar_id)
`

export interface TurmaComRelacoes {
  id: number
  nome: string
  modalidade: 'Presencial' | 'Online'
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_unica: string | null
  frequencia: Frequencia | null
  intervalo: number | null
  data_inicio: string | null
  data_fim: string | null
  fim_automatico: boolean
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: 'Ativa' | 'Encerrada'
  google_calendar_event_id: string | null
  link_videochamada: string | null
  servico_id: number
  materia_id: number | null
  escola_id: number | null
  ano_escolar_id: number
  professor_id: number
  servico: { id: number; nome: string; permite_materia: boolean; permite_escola: boolean } | null
  materia: { id: number; nome: string } | null
  escola: { id: number; nome: string } | null
  ano_escolar: { id: number; nome: string } | null
  professor: { id: number; nome: string; google_calendar_id: string | null } | null
  alunos_matriculados?: number
  /** Alunos de outras turmas que vêm repor numa aula desta, de hoje em diante. */
  reposicoes_marcadas?: number
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

  // Contagem exibida na listagem: matriculas regulares ativas e, a parte, as
  // reposicoes que ainda vao acontecer (correcao de 13/10/2026: a turma que so
  // tinha aluno de reposicao aparecia como vazia). A matricula de reposicao
  // vale so para a data da aula, entao a de data passada nao conta mais.
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const { data: contagens } = await supabase
    .from('matriculas')
    .select('turma_id, flag_reposicao, data_fim')
    .eq('status', 'Ativa')

  const regulares = new Map<number, number>()
  const reposicoes = new Map<number, number>()
  for (const linha of (contagens ?? []) as {
    turma_id: number
    flag_reposicao: boolean
    data_fim: string | null
  }[]) {
    if (!linha.flag_reposicao) {
      regulares.set(linha.turma_id, (regulares.get(linha.turma_id) ?? 0) + 1)
    } else if (linha.data_fim && String(linha.data_fim).slice(0, 10) >= hoje) {
      reposicoes.set(linha.turma_id, (reposicoes.get(linha.turma_id) ?? 0) + 1)
    }
  }

  return turmas.map((t) => ({
    ...t,
    alunos_matriculados: regulares.get(t.id) ?? 0,
    reposicoes_marcadas: reposicoes.get(t.id) ?? 0,
  }))
}

/**
 * Só id e rótulo das turmas que batem com os filtros, sem a contagem de alunos
 * que a listagem faz. Agenda e matrículas filtram por campos da turma
 * (professor, matéria, escola) através disto, e o seletor "Turma" sai daqui —
 * por isso o rótulo leva dia e horário: o nome sozinho repete entre turmas.
 */
export async function turmasResumidas(
  filtros: FiltrosDeTurma = {},
): Promise<{ id: number; nome: string }[]> {
  const supabase = await clienteServidor()
  let consulta = supabase
    .from('turmas')
    .select('id, nome, tipo_recorrencia, data_unica, dias_semana, frequencia, intervalo, data_inicio, horario_inicio')

  if (filtros.professorId) consulta = consulta.eq('professor_id', filtros.professorId)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)
  if (filtros.materiaId) consulta = consulta.eq('materia_id', filtros.materiaId)
  if (filtros.escolaId) consulta = consulta.eq('escola_id', filtros.escolaId)
  if (filtros.modalidade) consulta = consulta.eq('modalidade', filtros.modalidade)

  const { data, error } = await consulta.order('nome').order('horario_inicio')
  if (error) throw new Error(`Falha ao listar turmas: ${error.message}`)
  return (data ?? []).map((t) => ({ id: t.id, nome: rotuloDaTurma(t) }))
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
  /** Rodada 4: para o resumo do formulário e o alerta da aula única. */
  feriados: Feriado[]
  recessos: RecessoEscolar[]
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

  // Um ano para trás (início retroativo) e dois para a frente.
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const ano = Number(hoje.slice(0, 4))
  const calendario = await calendarioEscolar(supabase, `${ano - 1}-01-01`, `${ano + 2}-12-31`)

  return {
    feriados: calendario.feriados,
    recessos: calendario.recessos,
    servicos: servicos.data ?? [],
    materias: materias.data ?? [],
    escolas: escolas.data ?? [],
    anosEscolares: anos.data ?? [],
    professores: professores.data ?? [],
  }
}
