import 'server-only'
import { clienteServidor } from './cliente'
import { provedorAtivo } from '@/agenda'
import { conflitosComFeriado, type ConflitoFeriado } from '@/dominio/agenda/feriados'

export interface AulaComTurma {
  id: number
  turma_id: number
  google_calendar_event_id: string
  data_hora_inicio: string
  data_hora_fim: string
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
  link_online: string | null
  observacao: string | null
  turma: { id: number; nome: string; modalidade: string; professor_id: number } | null
}

const SELECT_AULA = `
  id, turma_id, google_calendar_event_id, data_hora_inicio, data_hora_fim,
  status, link_online, observacao,
  turma:turmas!turma_id (id, nome, modalidade, professor_id)
`

/**
 * Materializa as aulas das turmas ativas no intervalo e grava por upsert na
 * chave google_calendar_event_id. Reprocessar o mesmo intervalo nao duplica
 * nada — e a propriedade que o teste de determinismo em materializacao.test.ts
 * garante.
 *
 * `ignoreDuplicates` preserva o que ja existe: uma aula com presenca registrada
 * ou status ajustado a mao nao pode ser sobrescrita pela sincronizacao.
 */
export async function sincronizarAulas(
  de: string,
  ate: string,
): Promise<{ criadas: number; turmas: number }> {
  const supabase = await clienteServidor()
  const provedor = provedorAtivo()

  const { data: turmas, error } = await supabase
    .from('turmas')
    .select('id, dias_semana, horario_inicio, horario_fim, status, google_calendar_event_id, modalidade')
    .eq('status', 'Ativa')

  if (error) throw new Error(`Falha ao carregar turmas: ${error.message}`)

  // Todas as ocorrencias de todas as turmas num unico upsert. Uma chamada por
  // turma custava ~2s na abertura da agenda, com cinco turmas — cada uma
  // pagando a latencia inteira ate o banco.
  const linhas: {
    turma_id: number
    google_calendar_event_id: string
    data_hora_inicio: string
    data_hora_fim: string
  }[] = []

  for (const turma of turmas ?? []) {
    const ocorrencias = await provedor.listarOcorrencias(
      {
        id: turma.id,
        dias_semana: turma.dias_semana ?? [],
        horario_inicio: String(turma.horario_inicio).slice(0, 5),
        horario_fim: String(turma.horario_fim).slice(0, 5),
        status: 'Ativa',
        google_calendar_event_id: turma.google_calendar_event_id,
        modalidade: turma.modalidade,
      },
      de,
      ate,
    )

    for (const o of ocorrencias) {
      linhas.push({
        turma_id: turma.id,
        google_calendar_event_id: o.google_calendar_event_id,
        data_hora_inicio: `${o.data}T${o.horario_inicio}:00`,
        data_hora_fim: `${o.data}T${o.horario_fim}:00`,
      })
    }
  }

  if (linhas.length === 0) return { criadas: 0, turmas: turmas?.length ?? 0 }

  // Le antes de escrever. A agenda sincroniza a cada abertura, e no caso comum
  // — nada mudou — um upsert gravaria dezenas de linhas so para o banco
  // descarta-las. Uma leitura barata deixa o caso comum sem escrita nenhuma.
  const { data: existentes } = await supabase
    .from('aulas')
    .select('google_calendar_event_id')
    .in('google_calendar_event_id', linhas.map((l) => l.google_calendar_event_id))

  const jaExistem = new Set((existentes ?? []).map((a) => a.google_calendar_event_id))
  const faltando = linhas.filter((l) => !jaExistem.has(l.google_calendar_event_id))

  if (faltando.length === 0) return { criadas: 0, turmas: turmas?.length ?? 0 }

  // `ignoreDuplicates` protege da corrida entre duas abas abrindo a agenda ao
  // mesmo tempo: aula com presenca registrada nunca e sobrescrita.
  const { data, error: erroUpsert } = await supabase
    .from('aulas')
    .upsert(faltando, { onConflict: 'google_calendar_event_id', ignoreDuplicates: true })
    .select('id')

  if (erroUpsert) throw new Error(`Falha ao sincronizar aulas: ${erroUpsert.message}`)

  return { criadas: data?.length ?? 0, turmas: turmas?.length ?? 0 }
}

export async function listarAulas(filtros: {
  de: string
  ate: string
  turmaId?: number
  professorId?: number
}): Promise<AulaComTurma[]> {
  const supabase = await clienteServidor()
  let consulta = supabase
    .from('aulas')
    .select(SELECT_AULA)
    .gte('data_hora_inicio', `${filtros.de}T00:00:00`)
    .lte('data_hora_inicio', `${filtros.ate}T23:59:59`)

  if (filtros.turmaId) consulta = consulta.eq('turma_id', filtros.turmaId)

  const { data, error } = await consulta.order('data_hora_inicio')
  if (error) throw new Error(`Falha ao listar aulas: ${error.message}`)

  const aulas = (data ?? []) as unknown as AulaComTurma[]
  return filtros.professorId
    ? aulas.filter((a) => a.turma?.professor_id === filtros.professorId)
    : aulas
}

export async function obterAula(id: number): Promise<AulaComTurma | null> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase.from('aulas').select(SELECT_AULA).eq('id', id).maybeSingle()
  if (error) throw new Error(`Falha ao carregar aula: ${error.message}`)
  return (data ?? null) as unknown as AulaComTurma | null
}

/** Alunos com matricula ativa na turma na data da aula. */
export async function matriculadosNaAula(aulaId: number) {
  const supabase = await clienteServidor()
  const { data: aula } = await supabase
    .from('aulas')
    .select('turma_id, data_hora_inicio')
    .eq('id', aulaId)
    .maybeSingle()

  if (!aula) return []

  const dia = String(aula.data_hora_inicio).slice(0, 10)
  const { data } = await supabase
    .from('matriculas')
    .select('aluno_id, flag_reposicao, data_inicio, data_fim, aluno:alunos!aluno_id (id, nome)')
    .eq('turma_id', aula.turma_id)
    .eq('status', 'Ativa')
    .lte('data_inicio', dia)

  return ((data ?? []) as unknown as {
    aluno_id: number
    flag_reposicao: boolean
    data_fim: string | null
    aluno: { id: number; nome: string } | null
  }[])
    .filter((m) => !m.data_fim || m.data_fim >= dia)
    .map((m) => ({
      aluno_id: m.aluno_id,
      nome: m.aluno?.nome ?? 'Aluno removido',
      flag_reposicao: m.flag_reposicao,
    }))
}

/** Aulas agendadas que caem em feriado, para o alerta da gestora (RN 4.2). */
export async function conflitosDeFeriado(de: string, ate: string): Promise<ConflitoFeriado[]> {
  const supabase = await clienteServidor()
  const [aulas, feriados] = await Promise.all([
    supabase
      .from('aulas')
      .select('id, data_hora_inicio, status')
      .gte('data_hora_inicio', `${de}T00:00:00`)
      .lte('data_hora_inicio', `${ate}T23:59:59`),
    supabase.from('feriados').select('data, nome').gte('data', de).lte('data', ate),
  ])

  return conflitosComFeriado(
    (aulas.data ?? []).map((a) => ({
      id: a.id,
      data: String(a.data_hora_inicio).slice(0, 10),
      status: a.status,
    })),
    feriados.data ?? [],
  )
}
