import 'server-only'
import { clienteServidor } from './cliente'
import { lerTudo } from './cobrancas'
import { situacoesDasAulas } from './situacao-das-aulas'
import type { AlunoDaVarredura, AulaDaVarredura, Escopo } from '@/dominio/agenda/varredura'
import type { StatusAula } from '@/dominio/tipos'
import type { StatusCobranca } from '@/dominio/reposicoes/desfecho'

const dia = (v: unknown) => String(v).slice(0, 10)
const nome = (a: unknown) => (a as { nome: string } | null)?.nome ?? 'Aluno'

/**
 * Etapa 6 (29/10/2026): os fatos de cada aula do escopo, para a varredura
 * (`dominio/agenda/varredura.ts`). So leitura.
 *
 * Os alunos seguem `lista-da-aula.ts`: matricula ativa da turma que cobre a
 * data de referencia. A reposicao vem pela pendencia que aponta para a aula,
 * nao pela marca da matricula: o aluno pode repor numa turma em que ja estava.
 *
 * Qualquer erro de leitura estoura: contar "nenhuma cobranca" por engano
 * liberaria uma mudanca que nao podia.
 */
export async function aulasParaVarredura(
  turmaId: number,
  escopo: Escopo,
  ref: { aulaId?: number; aPartirDe?: string },
): Promise<AulaDaVarredura[]> {
  const supabase = await clienteServidor()

  let consulta = supabase
    .from('aulas')
    .select('id, turma_id, status, data_hora_inicio, data_hora_fim, data_hora_referencia')
    .eq('turma_id', turmaId)
  if (escopo === 'esta') consulta = consulta.eq('id', ref.aulaId ?? 0)
  if (escopo === 'a-partir') consulta = consulta.gte('data_hora_referencia', `${ref.aPartirDe}T00:00:00`)
  const { data: lidas, error } = await consulta.order('data_hora_referencia')
  if (error) throw new Error(`Falha ao ler as aulas: ${error.message}`)

  const aulas = (lidas ?? []).map((a) => ({ ...a, status: a.status as StatusAula }))
  if (aulas.length === 0) return []
  const ids = aulas.map((a) => a.id as number)

  const [situacoes, matriculas, pendencias, itens] = await Promise.all([
    situacoesDasAulas(aulas),
    lerTudo((de, ate) =>
      supabase
        .from('matriculas')
        .select('aluno_id, data_inicio, data_fim, aluno:alunos!aluno_id (nome)')
        .eq('turma_id', turmaId)
        .eq('status', 'Ativa')
        .order('id')
        .range(de, ate),
    ),
    // Uma serie tem centenas de aulas: em grupos, para nao estourar a URL.
    emGrupos(ids, (grupo) =>
      lerTudo((de, ate) =>
        supabase
          .from('pendencias_reposicao')
          .select('aluno_id, status, aula_origem_id, aula_reposicao_id, aluno:alunos!aluno_id (nome)')
          .or(`aula_origem_id.in.(${grupo.join(',')}),aula_reposicao_id.in.(${grupo.join(',')})`)
          .order('id')
          .range(de, ate),
      ),
    ),
    emGrupos(ids, (grupo) =>
      lerTudo((de, ate) =>
        supabase
          .from('itens_cobranca')
          .select('aluno_id, aula_id, cobranca:cobrancas!inner (status)')
          .in('aula_id', grupo)
          .neq('cobranca.status', 'Cancelada')
          .order('id')
          .range(de, ate),
      ),
    ),
  ])

  return aulas.map((a) => {
    const data = dia(a.data_hora_referencia)
    const alunos = new Map<number, AlunoDaVarredura>()

    for (const m of matriculas as { aluno_id: number; data_inicio: string; data_fim: string | null; aluno: unknown }[]) {
      if (dia(m.data_inicio) > data || (m.data_fim && dia(m.data_fim) < data)) continue
      alunos.set(m.aluno_id, { aluno_id: m.aluno_id, nome: nome(m.aluno), vinculo: 'turma', avisou: false, cobranca: null })
    }
    for (const p of pendencias as {
      aluno_id: number
      status: string
      aula_origem_id: number
      aula_reposicao_id: number | null
      aluno: unknown
    }[]) {
      if (p.aula_origem_id === a.id) {
        const x = alunos.get(p.aluno_id)
        if (x) x.avisou = true
      }
      if (p.aula_reposicao_id === a.id && p.status === 'Agendada') {
        alunos.set(p.aluno_id, { aluno_id: p.aluno_id, nome: nome(p.aluno), vinculo: 'reposicao', avisou: false, cobranca: null })
      }
    }
    for (const i of itens as unknown as { aluno_id: number; aula_id: number; cobranca: { status: StatusCobranca } }[]) {
      if (i.aula_id !== a.id) continue
      const x = alunos.get(i.aluno_id)
      if (x) x.cobranca = i.cobranca.status
    }

    return {
      id: a.id,
      data,
      inicio: String(a.data_hora_inicio).slice(0, 16),
      situacao: situacoes.get(a.id) ?? { principal: 'Criada', cobranca: null, pagamento: null },
      alunos: [...alunos.values()],
    }
  })
}

async function emGrupos<T>(ids: number[], ler: (grupo: number[]) => Promise<T[]>): Promise<T[]> {
  const todos: T[] = []
  for (let i = 0; i < ids.length; i += 200) todos.push(...(await ler(ids.slice(i, i + 200))))
  return todos
}
