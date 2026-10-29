import 'server-only'
import { clienteServidor } from './cliente'
import { executarEncerramento, previaEncerramento } from './encerramento'
import { desistirReposicao } from './reposicoes'
import { aulasParaVarredura } from './varredura'
import { planoDeSaida, varrer, type PlanoDeSaida, type Respostas } from '@/dominio/agenda/varredura'

/**
 * Etapa 6c (29/10/2026): excluir e encerrar pela previa de mudanca.
 *
 * O servidor refaz a varredura com as respostas da gestora (os dados podem
 * ter mudado desde a previa) e so entao grava. Cada aula sai pela funcao
 * `excluir_aula`, a mesma do "Excluir esta aula": a pendencia de cada aluno
 * nasce la, e quem vinha repor volta para as pendentes. "Sem reposicao" e
 * "credito" sao a desistencia sem cobrar (Rodada 3): tira a aula do rascunho
 * ou, se ja foi cobrada, vira credito (decisao 9).
 */

export type ResultadoDaSaida =
  | { ok: true; turmasAfetadas: number[]; avisar: { nome: string; data: string }[] }
  /** `parcial`: algumas aulas ja sairam antes da falha (o Google tem de acompanhar). */
  | { ok: false; erros: string[]; parcial?: boolean }

/** Tira as aulas do plano da agenda, aluno por aluno. */
async function tirarAulas(
  turmaId: number,
  aulas: PlanoDeSaida['aulas'],
): Promise<{ erros: string[]; turmasAfetadas: number[] }> {
  const supabase = await clienteServidor()
  const turmasAfetadas = new Set<number>()
  const erros: string[] = []

  for (const a of aulas) {
    const quando = `${a.data.slice(8, 10)}/${a.data.slice(5, 7)}`
    const { data: repondo, error: erroRepondo } = a.devolver.length
      ? await supabase
          .from('pendencias_reposicao')
          .select('id, aluno_id')
          .eq('aula_reposicao_id', a.id)
          .eq('status', 'Agendada')
          .in('aluno_id', a.devolver)
      : { data: [], error: null }
    if (erroRepondo) return { erros: [erroRepondo.message], turmasAfetadas: [...turmasAfetadas] }

    const sem = { aula_destino_id: null, matricula_turma_id: null, matricula_data: null }
    const { error } = await supabase.rpc('excluir_aula', {
      p_aula_id: a.id,
      p_novas: a.alunos.map((x) => ({ aluno_id: x.aluno_id, ...sem })),
      p_devolvidas: (repondo ?? []).map((p) => ({ pendencia_id: p.id, ...sem })),
    })
    // Parar na primeira falha: as aulas anteriores ja sairam e ficam
    // coerentes; as seguintes continuam como estavam.
    if (error) return { erros: [`Aula de ${quando}: ${error.message}`], turmasAfetadas: [...turmasAfetadas] }

    const desistir = a.alunos.filter((x) => x.desfecho !== 'reposicao').map((x) => x.aluno_id)
    if (desistir.length === 0) continue
    const { data: pendencias, error: erroPend } = await supabase
      .from('pendencias_reposicao')
      .select('id, aluno_id')
      .eq('aula_origem_id', a.id)
      .in('aluno_id', desistir)
    if (erroPend) {
      erros.push(`Aula de ${quando}: ${erroPend.message}`)
      continue
    }
    for (const p of pendencias ?? []) {
      const r = await desistirReposicao(p.id, { cobrar: false, pagarProfessor: false })
      // A aula ja saiu: o aluno fica com a reposicao pendente, que a gestora
      // resolve em Reposicoes. Melhor que desfazer a exclusao.
      if (!r.ok) erros.push(`Aula de ${quando}: ${(r.erros ?? []).join(' ')} O aluno ficou com a reposição pendente.`)
      for (const t of r.turmasAfetadas ?? []) turmasAfetadas.add(t)
    }
  }
  turmasAfetadas.delete(turmaId)
  return { erros, turmasAfetadas: [...turmasAfetadas] }
}

/** Excluir "so esta aula" pela previa: com reposicao, sem reposicao ou credito. */
export async function excluirPelaPrevia(
  turmaId: number,
  aulaId: number,
  respostas: Respostas,
): Promise<ResultadoDaSaida> {
  const aulas = await aulasParaVarredura(turmaId, 'esta', { aulaId })
  const v = varrer(aulas, { tipo: 'excluir' }, 'esta', respostas)
  const plano = planoDeSaida(aulas, v)
  if (plano.erros.length > 0) return { ok: false, erros: plano.erros }

  const r = await tirarAulas(turmaId, plano.aulas)
  if (r.erros.length > 0) return { ok: false, erros: r.erros, parcial: true }
  return { ok: true, turmasAfetadas: r.turmasAfetadas, avisar: v.avisar }
}

/**
 * Encerrar pela previa. As travas de data (aula dada depois, inicio e fim da
 * turma) sao conferidas antes de tirar qualquer aula; depois, as aulas com
 * aluno cobrado ou com reposicao saem uma a uma, e `encerrar_turma` faz o
 * resto, conferindo tudo de novo.
 */
export async function encerrarPelaPrevia(
  turmaId: number,
  data: string,
  respostas: Respostas,
): Promise<ResultadoDaSaida> {
  const previa = await previaEncerramento(turmaId, data, { resolvidoNaPrevia: true })
  if (previa.tipo === 'invalida') return { ok: false, erros: [previa.motivo] }
  if (previa.unica) return { ok: false, erros: ['Turma de aula única: use o "Encerrar turma" da própria turma.'] }
  if (!previa.avaliacao.pode) return { ok: false, erros: previa.avaliacao.motivos }

  const aulas = await aulasParaVarredura(turmaId, 'a-partir', { aPartirDe: data })
  const v = varrer(aulas, { tipo: 'encerrar' }, 'a-partir', respostas)
  const plano = planoDeSaida(aulas, v)
  if (plano.erros.length > 0) return { ok: false, erros: plano.erros }

  // So as que tem aluno a resolver: o resto `encerrar_turma` tira de uma vez.
  const r = await tirarAulas(
    turmaId,
    plano.aulas.filter((a) => a.alunos.length > 0 || a.devolver.length > 0),
  )
  if (r.erros.length > 0) {
    return {
      ok: false,
      erros: [...r.erros, 'A turma não foi encerrada. Abra a prévia de novo para ver o que falta.'],
      parcial: true,
    }
  }

  const fim = await executarEncerramento(turmaId, data)
  if (!fim.ok) return { ...fim, parcial: true }
  return { ok: true, turmasAfetadas: r.turmasAfetadas, avisar: v.avisar }
}
