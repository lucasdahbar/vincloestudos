import 'server-only'
import { clienteServidor } from './cliente'
import { recalcularTotais } from './cobrancas'
import {
  avaliarEncerramento,
  dataDoEncerramento,
  type AvaliacaoEncerramento,
  type SituacaoEncerramento,
} from '@/dominio/turmas/encerramento'
import type { StatusAula } from '@/dominio/tipos'

/** Encerrar turma (pedido do tio, 13/10/2026; spec 2026-10-13-encerrar-turma). */

const dia = (v: unknown) => String(v).slice(0, 10)
const nome = (a: unknown) => (a as { nome: string } | null)?.nome ?? 'Aluno'

export type PreviaEncerramento =
  | { tipo: 'invalida'; motivo: string }
  | { tipo: 'avaliada'; data: string; unica: boolean; avaliacao: AvaliacaoEncerramento }

/**
 * Le tudo o que a regra precisa. Qualquer erro de leitura estoura: contar
 * "nenhuma cobranca" por engano liberaria um encerramento que nao podia.
 */
async function situacao(
  turmaId: number,
  dataInformada: string | null,
): Promise<SituacaoEncerramento & { status: string }> {
  const supabase = await clienteServidor()
  const falhou = (e: { message: string } | null) => {
    if (e) throw new Error(`Falha ao conferir a turma: ${e.message}`)
  }

  const { data: turma, error: erroTurma } = await supabase
    .from('turmas')
    .select('id, status, tipo_recorrencia, data_inicio, data_fim, data_unica')
    .eq('id', turmaId)
    .maybeSingle()
  falhou(erroTurma)
  if (!turma) throw new Error('Esta turma não existe mais.')

  // Na recorrente so interessa o que vem a partir da data. Ler a turma
  // inteira esbarraria no limite de 1000 linhas do Supabase (presencas e
  // itens de cobranca de um ano todo) e a previa diria "pode" a toa. A aula
  // unica le tudo: a data depende de a aula ter acontecido.
  const desde =
    turma.tipo_recorrencia === 'Recorrente' && dataInformada ? `${dataInformada}T00:00:00` : null
  const aPartir = <T extends { gte: (c: string, v: string) => T }>(q: T, coluna: string) =>
    desde ? q.gte(coluna, desde) : q

  const [aulas, presencas, matriculas, chegando, itens, pendencias] = await Promise.all([
    aPartir(
      supabase.from('aulas').select('id, data_hora_inicio, status').eq('turma_id', turmaId),
      'data_hora_inicio',
    ),
    aPartir(
      supabase.from('presencas').select('aula_id, aula:aulas!inner (turma_id, data_hora_inicio)').eq('aula.turma_id', turmaId),
      'aula.data_hora_inicio',
    ),
    supabase
      .from('matriculas')
      .select('id', { count: 'exact', head: true })
      .eq('turma_id', turmaId)
      .eq('status', 'Ativa')
      .eq('flag_reposicao', false),
    aPartir(
      supabase
        .from('pendencias_reposicao')
        .select('aluno:alunos!aluno_id (nome), aula:aulas!aula_reposicao_id!inner (turma_id, data_hora_inicio)')
        .eq('aula.turma_id', turmaId)
        .eq('status', 'Agendada'),
      'aula.data_hora_inicio',
    ),
    aPartir(
      supabase
        .from('itens_cobranca')
        .select(
          'aluno_id, aula_id, aluno:alunos!aluno_id (nome), cobranca:cobrancas!inner (status), aula:aulas!inner (turma_id, data_hora_inicio, status)',
        )
        .eq('aula.turma_id', turmaId)
        .neq('cobranca.status', 'Cancelada'),
      'aula.data_hora_inicio',
    ),
    aPartir(
      supabase
        .from('pendencias_reposicao')
        .select('aluno_id, aula_origem_id, aula:aulas!aula_origem_id!inner (turma_id, data_hora_inicio)')
        .eq('aula.turma_id', turmaId),
      'aula.data_hora_inicio',
    ),
  ])
  for (const r of [aulas, presencas, matriculas, chegando, itens, pendencias]) falhou(r.error)

  const comPresenca = new Set((presencas.data ?? []).map((p) => p.aula_id as number))
  const comReposicao = new Set(
    (pendencias.data ?? []).map((p) => `${p.aluno_id}:${p.aula_origem_id}`),
  )

  return {
    status: turma.status,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_inicio: turma.data_inicio ? dia(turma.data_inicio) : null,
    data_fim: turma.data_fim ? dia(turma.data_fim) : null,
    data_unica: turma.data_unica ? dia(turma.data_unica) : null,
    aulas: (aulas.data ?? []).map((a) => ({
      data: dia(a.data_hora_inicio),
      status: a.status as StatusAula,
      temPresenca: comPresenca.has(a.id as number),
    })),
    matriculasAtivas: matriculas.count ?? 0,
    reposicoesChegando: (chegando.data ?? []).map((p) => ({
      aluno: nome(p.aluno),
      data: dia((p.aula as unknown as { data_hora_inicio: string }).data_hora_inicio),
    })),
    cobrancas: (itens.data ?? []).map((i) => {
      const aula = i.aula as unknown as { data_hora_inicio: string; status: StatusAula }
      const cobranca = i.cobranca as unknown as { status: string }
      return {
        aluno: nome(i.aluno),
        data: dia(aula.data_hora_inicio),
        confirmada: cobranca.status !== 'Rascunho',
        // Aula ja excluida tambem resolve: os alunos dela ja foram para reposicao.
        temReposicao:
          aula.status === 'Excluída' || comReposicao.has(`${i.aluno_id}:${i.aula_id}`),
      }
    }),
  }
}

export async function previaEncerramento(
  turmaId: number,
  dataInformada: string | null,
): Promise<PreviaEncerramento> {
  const dataValida = (d: string | null) => d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d)
  const informada = dataValida(dataInformada) ? dataInformada : null

  const s = await situacao(turmaId, informada)
  if (s.status !== 'Ativa') return { tipo: 'invalida', motivo: 'Esta turma já está encerrada.' }

  const data = dataDoEncerramento(s, informada)
  if (!data || !dataValida(data)) {
    return { tipo: 'invalida', motivo: 'Informe a data a partir da qual a turma não tem mais aula.' }
  }

  return {
    tipo: 'avaliada',
    data,
    unica: s.tipo_recorrencia === 'Único',
    avaliacao: avaliarEncerramento(s, data),
  }
}

/** Confere de novo e aplica tudo numa transação (função `encerrar_turma`). */
export async function executarEncerramento(
  turmaId: number,
  dataInformada: string | null,
): Promise<{ ok: true } | { ok: false; erros: string[] }> {
  const previa = await previaEncerramento(turmaId, dataInformada)
  if (previa.tipo === 'invalida') return { ok: false, erros: [previa.motivo] }
  if (!previa.avaliacao.pode) return { ok: false, erros: previa.avaliacao.motivos }

  const supabase = await clienteServidor()
  const { data: cobrancas, error } = await supabase.rpc('encerrar_turma', {
    p_turma_id: turmaId,
    p_data: previa.data,
  })
  if (error) return { ok: false, erros: [error.message] }

  // O rascunho perdeu itens: o total tem de acompanhar.
  for (const id of (cobrancas ?? []) as number[]) await recalcularTotais(id)

  return { ok: true }
}
