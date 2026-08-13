import 'server-only'
import { clienteServidor } from './cliente'
import { planejarReposicao, validarDesistencia, type Pendencia } from '@/dominio/reposicoes/agendamento'

export interface PendenciaComRelacoes {
  id: number
  aluno_id: number
  aula_origem_id: number
  status: 'Pendente' | 'Agendada' | 'Realizada' | 'Desistida'
  aula_reposicao_id: number | null
  aluno: { id: number; nome: string } | null
  aula_origem: {
    id: number
    data_hora_inicio: string
    turma_id: number
    turma: { id: number; nome: string } | null
  } | null
}

const SELECT = `
  id, aluno_id, aula_origem_id, status, aula_reposicao_id,
  aluno:alunos!aluno_id (id, nome),
  aula_origem:aulas!aula_origem_id (
    id, data_hora_inicio, turma_id, turma:turmas!turma_id (id, nome)
  )
`

export async function listarPendencias(filtros: { status?: string; alunoId?: number } = {}) {
  const supabase = await clienteServidor()
  let consulta = supabase.from('pendencias_reposicao').select(SELECT)

  if (filtros.status) consulta = consulta.eq('status', filtros.status)
  if (filtros.alunoId) consulta = consulta.eq('aluno_id', filtros.alunoId)

  const { data, error } = await consulta.order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao listar reposições: ${error.message}`)
  return (data ?? []) as unknown as PendenciaComRelacoes[]
}

/** Aulas futuras agendadas, para a gestora escolher o destino da reposição. */
export async function aulasDisponiveis(de: string) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('aulas')
    .select('id, data_hora_inicio, turma_id, turma:turmas!turma_id (id, nome)')
    .eq('status', 'Agendada')
    .gte('data_hora_inicio', `${de}T00:00:00`)
    .order('data_hora_inicio')
    .limit(200)

  return (data ?? []) as unknown as {
    id: number
    data_hora_inicio: string
    turma_id: number
    turma: { id: number; nome: string } | null
  }[]
}

/**
 * Agenda a reposição. Quando é em turma diferente da original, cria a matrícula
 * com flag_reposicao — que nunca entra na base de cálculo de cobrança.
 */
export async function agendarReposicao(
  pendenciaId: number,
  aulaDestinoId: number,
): Promise<{ ok: boolean; erros?: string[] }> {
  const supabase = await clienteServidor()

  const { data: p } = await supabase
    .from('pendencias_reposicao')
    .select('id, aluno_id, aula_origem_id, status, aula_origem:aulas!aula_origem_id (turma_id)')
    .eq('id', pendenciaId)
    .maybeSingle()

  if (!p) return { ok: false, erros: ['Pendência não encontrada.'] }

  const { data: destino } = await supabase
    .from('aulas')
    .select('id, turma_id, status')
    .eq('id', aulaDestinoId)
    .maybeSingle()

  if (!destino) return { ok: false, erros: ['Aula de destino não encontrada.'] }

  const origem = p.aula_origem as unknown as { turma_id: number } | null

  const pendencia: Pendencia = {
    id: p.id,
    aluno_id: p.aluno_id,
    aula_origem_id: p.aula_origem_id,
    turma_origem_id: origem?.turma_id ?? 0,
    status: p.status,
  }

  const { data: matriculas } = await supabase
    .from('matriculas')
    .select('aluno_id, turma_id')
    .eq('aluno_id', p.aluno_id)
    .eq('status', 'Ativa')

  const plano = planejarReposicao(pendencia, destino, matriculas ?? [])
  if (plano.erros.length > 0) return { ok: false, erros: plano.erros }

  let matriculaId: number | null = null
  if (plano.precisaMatricula && plano.matricula) {
    const { data, error } = await supabase
      .from('matriculas')
      .insert({ ...plano.matricula, data_inicio: new Date().toISOString().slice(0, 10) })
      .select('id')
      .single()
    if (error) return { ok: false, erros: [error.message] }
    matriculaId = data.id
  }

  const { error } = await supabase
    .from('pendencias_reposicao')
    .update({
      status: 'Agendada',
      aula_reposicao_id: aulaDestinoId,
      matricula_reposicao_id: matriculaId,
    })
    .eq('id', pendenciaId)

  if (error) return { ok: false, erros: [error.message] }
  return { ok: true }
}

export async function desistirReposicao(pendenciaId: number): Promise<{ ok: boolean; erros?: string[] }> {
  const supabase = await clienteServidor()
  const { data: p } = await supabase
    .from('pendencias_reposicao')
    .select('id, aluno_id, aula_origem_id, status')
    .eq('id', pendenciaId)
    .maybeSingle()

  if (!p) return { ok: false, erros: ['Pendência não encontrada.'] }

  const erros = validarDesistencia({ ...p, turma_origem_id: 0 })
  if (erros.length > 0) return { ok: false, erros }

  const { error } = await supabase
    .from('pendencias_reposicao')
    .update({ status: 'Desistida' })
    .eq('id', pendenciaId)

  if (error) return { ok: false, erros: [error.message] }
  return { ok: true }
}
