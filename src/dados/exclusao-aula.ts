import 'server-only'
import { clienteServidor } from './cliente'
import { aulasDisponiveis } from './reposicoes'
import {
  avaliarExclusaoAula,
  validarEscolhas,
  type AvaliacaoExclusaoAula,
  type EscolhaRegular,
  type EscolhaReposicao,
} from '@/dominio/agenda/exclusao-aula'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { planejarReposicao } from '@/dominio/reposicoes/agendamento'

const dia = (v: unknown) => String(v).slice(0, 10)

export interface PreviaExclusaoAula {
  turmaId: number
  avaliacao: AvaliacaoExclusaoAula
  /** Aulas futuras agendadas para a reposição, já sem esta. */
  destinos: { id: number; rotulo: string }[]
}

/** Spec 6.2: consultado antes de perguntar. */
export async function previaExclusaoAula(aulaId: number): Promise<PreviaExclusaoAula | null> {
  const supabase = await clienteServidor()
  const { data: aula, error: erroAula } = await supabase
    .from('aulas')
    .select('id, turma_id, status, data_hora_inicio')
    .eq('id', aulaId)
    .maybeSingle()
  if (erroAula) throw new Error(erroAula.message)
  if (!aula) return null

  const data = dia(aula.data_hora_inicio)
  const [presencas, matriculas, repondo, avisos] = await Promise.all([
    supabase.from('presencas').select('id', { count: 'exact', head: true }).eq('aula_id', aulaId),
    supabase
      .from('matriculas')
      .select('aluno_id, data_fim, aluno:alunos!aluno_id (nome)')
      .eq('turma_id', aula.turma_id)
      .eq('status', 'Ativa')
      .eq('flag_reposicao', false)
      .lte('data_inicio', data),
    supabase
      .from('pendencias_reposicao')
      .select('id, aluno_id, aluno:alunos!aluno_id (nome)')
      .eq('aula_reposicao_id', aulaId)
      .eq('status', 'Agendada'),
    supabase.from('pendencias_reposicao').select('aluno_id').eq('aula_origem_id', aulaId),
  ])
  // Erro tratado como "vazio" deixaria excluir uma aula que tem alunos.
  for (const r of [presencas, matriculas, repondo, avisos]) {
    if (r.error) throw new Error(r.error.message)
  }

  const nome = (a: unknown) => (a as { nome: string } | null)?.nome ?? 'Aluno'

  const avaliacao = avaliarExclusaoAula({
    status: aula.status,
    temPresenca: (presencas.count ?? 0) > 0,
    regulares: (matriculas.data ?? [])
      .filter((m) => !m.data_fim || dia(m.data_fim) >= data)
      .map((m) => ({ aluno_id: m.aluno_id, nome: nome(m.aluno) })),
    reposicoes: (repondo.data ?? []).map((p) => ({
      aluno_id: p.aluno_id,
      nome: nome(p.aluno),
      pendencia_id: p.id,
    })),
    comPendencia: (avisos.data ?? []).map((p) => p.aluno_id),
  })

  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const destinos =
    avaliacao.tipo === 'com-alunos'
      ? (await aulasDisponiveis(hoje))
          .filter((a) => a.id !== aulaId)
          .map((a) => ({
            id: a.id,
            rotulo: `${dia(a.data_hora_inicio).split('-').reverse().join('/')} ${String(a.data_hora_inicio).slice(11, 16)} — ${a.turma?.nome ?? 'Turma'}`,
          }))
      : []

  return { turmaId: aula.turma_id, avaliacao, destinos }
}

/**
 * Monta o plano de cada aluno (precisa de matrícula de reposição?) pelas
 * regras de `planejarReposicao` e aplica tudo numa transação no banco.
 */
export async function executarExclusaoAula(
  aulaId: number,
  regulares: EscolhaRegular[],
  reposicoes: EscolhaReposicao[],
): Promise<{ ok: true; turmaId: number } | { ok: false; erros: string[] }> {
  const previa = await previaExclusaoAula(aulaId)
  if (!previa) return { ok: false, erros: ['Esta aula não existe mais.'] }

  const { avaliacao } = previa
  if (avaliacao.tipo === 'bloqueada') return { ok: false, erros: [avaliacao.motivo] }

  if (avaliacao.tipo === 'com-alunos') {
    const erros = validarEscolhas(avaliacao, aulaId, regulares, reposicoes)
    if (erros.length > 0) return { ok: false, erros }
  }

  const supabase = await clienteServidor()
  const destinoIds = [...regulares, ...reposicoes]
    .map((e) => e.aula_destino_id)
    .filter((id): id is number => id !== null)

  // `.in` com lista vazia não traz nada, sem erro: não precisa de atalho.
  const [rDestinos, rPendencias] = await Promise.all([
    supabase.from('aulas').select('id, turma_id, status, data_hora_inicio').in('id', destinoIds),
    supabase
      .from('pendencias_reposicao')
      .select('id, aluno_id, aula_origem_id, status, aula_origem:aulas!aula_origem_id (turma_id)')
      .in('id', reposicoes.map((r) => r.pendencia_id)),
  ])
  if (rDestinos.error) throw new Error(rDestinos.error.message)
  if (rPendencias.error) throw new Error(rPendencias.error.message)
  const destinos = rDestinos.data
  const pendencias = rPendencias.data

  const destinoPorId = new Map((destinos ?? []).map((d) => [d.id, d]))
  const erros: string[] = []

  async function planoDe(
    pendencia: { id: number; aluno_id: number; aula_origem_id: number; turma_origem_id: number },
    destinoId: number | null,
  ) {
    if (destinoId === null) return { aula_destino_id: null, matricula_turma_id: null, matricula_data: null }
    const destino = destinoPorId.get(destinoId)
    if (!destino) {
      erros.push('Uma das aulas escolhidas para reposição não existe mais.')
      return null
    }
    if (destino.status !== 'Agendada') {
      erros.push('Uma das aulas escolhidas para reposição não está mais disponível.')
      return null
    }
    const { data: mats, error: erroMats } = await supabase
      .from('matriculas')
      .select('aluno_id, turma_id')
      .eq('aluno_id', pendencia.aluno_id)
      .eq('status', 'Ativa')
      // A reposição que sai junto com esta aula não conta como matrícula.
      .eq('flag_reposicao', false)
    if (erroMats) throw new Error(erroMats.message)
    const plano = planejarReposicao(
      { ...pendencia, status: 'Pendente' },
      { id: destino.id, turma_id: destino.turma_id, status: destino.status },
      mats ?? [],
    )
    erros.push(...plano.erros)
    return {
      aula_destino_id: destinoId,
      matricula_turma_id: plano.precisaMatricula ? destino.turma_id : null,
      matricula_data: plano.precisaMatricula ? dia(destino.data_hora_inicio) : null,
    }
  }

  const novas = []
  if (avaliacao.tipo === 'com-alunos') {
    for (const a of avaliacao.regulares) {
      const escolha = regulares.find((e) => e.aluno_id === a.aluno_id)!
      const plano = await planoDe(
        { id: 0, aluno_id: a.aluno_id, aula_origem_id: aulaId, turma_origem_id: previa.turmaId },
        escolha.aula_destino_id,
      )
      if (plano) novas.push({ aluno_id: a.aluno_id, ...plano })
    }
  }

  const devolvidas = []
  for (const r of reposicoes) {
    const p = (pendencias ?? []).find((x) => x.id === r.pendencia_id)
    if (!p) {
      erros.push('Uma reposição desta aula não existe mais. Abra a aula de novo.')
      continue
    }
    const origem = p.aula_origem as unknown as { turma_id: number } | null
    const plano = await planoDe(
      { id: p.id, aluno_id: p.aluno_id, aula_origem_id: p.aula_origem_id, turma_origem_id: origem?.turma_id ?? 0 },
      r.aula_destino_id,
    )
    if (plano) devolvidas.push({ pendencia_id: p.id, ...plano })
  }

  if (erros.length > 0) return { ok: false, erros: [...new Set(erros)] }

  const { error } = await supabase.rpc('excluir_aula', {
    p_aula_id: aulaId,
    p_novas: novas,
    p_devolvidas: devolvidas,
  })
  if (error) return { ok: false, erros: [error.message] }

  return { ok: true, turmaId: previa.turmaId }
}
