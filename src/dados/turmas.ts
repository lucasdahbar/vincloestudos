import 'server-only'
import { clienteServidor } from './cliente'
import { rotuloDaTurma } from '@/dominio/turmas/quando'
import { alunosDaTurma, turmaVencida } from '@/dominio/turmas/lista'
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
  /** Matrículas avulsas (um dia só) de hoje em diante. */
  avulsos_marcados?: number
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

  // Contagem exibida na listagem (etapa 4, 28/10/2026): quem esta ou vai estar
  // na turma. O avulso de um dia e a reposicao contam a parte, e so os que
  // ainda vao acontecer. A regra e `alunosDaTurma`.
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const { data: matriculas } = await supabase
    .from('matriculas')
    .select('turma_id, flag_reposicao, data_inicio, data_fim')
    .eq('status', 'Ativa')

  const porTurma = new Map<number, { flag_reposicao: boolean; data_inicio: string; data_fim: string | null }[]>()
  for (const m of matriculas ?? []) {
    const lista = porTurma.get(m.turma_id) ?? []
    lista.push({
      flag_reposicao: m.flag_reposicao,
      data_inicio: String(m.data_inicio),
      data_fim: m.data_fim ? String(m.data_fim) : null,
    })
    porTurma.set(m.turma_id, lista)
  }

  return turmas.map((t) => {
    const c = alunosDaTurma(porTurma.get(t.id) ?? [], hoje)
    return { ...t, alunos_matriculados: c.fixos, avulsos_marcados: c.avulsos, reposicoes_marcadas: c.reposicoes }
  })
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

/**
 * Etapa 4 (28/10/2026): fecha as turmas que terminaram (aula unica que passou,
 * serie cujo fim a gestora escolheu e passou). A regra e `turmaVencida`; o
 * banco confere de novo em `fechar_turma_vencida`. Com `ensaio`, so lista.
 */
export async function fecharTurmasVencidas(
  { ensaio = false }: { ensaio?: boolean } = {},
): Promise<{ id: number; nome: string }[]> {
  const supabase = await clienteServidor()
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const { data, error } = await supabase
    .from('turmas')
    .select('id, nome, tipo_recorrencia, status, data_unica, data_fim, fim_automatico, dias_semana, horario_inicio, frequencia, intervalo, data_inicio')
    .eq('status', 'Ativa')
  if (error) throw new Error(`Falha ao conferir as turmas vencidas: ${error.message}`)

  const vencidas = (data ?? []).filter((t) =>
    turmaVencida(
      {
        tipo_recorrencia: t.tipo_recorrencia,
        status: t.status,
        data_unica: t.data_unica ? String(t.data_unica) : null,
        data_fim: t.data_fim ? String(t.data_fim) : null,
        fim_automatico: t.fim_automatico,
      },
      hoje,
    ),
  )
  if (ensaio) return vencidas.map((t) => ({ id: t.id, nome: rotuloDaTurma(t) }))

  const fechadas: { id: number; nome: string }[] = []
  for (const t of vencidas) {
    const { data: fechou, error: erro } = await supabase.rpc('fechar_turma_vencida', { p_turma_id: t.id })
    if (erro) console.error(`falha ao fechar a turma ${t.id}:`, erro.message)
    else if (fechou) fechadas.push({ id: t.id, nome: rotuloDaTurma(t) })
  }
  return fechadas
}
