import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { concluirReposicoes } from './lista-da-aula'
import { planejarCorrecao, type PendenciaDaAula } from '@/dominio/presencas/correcao'
import {
  montarRegistro,
  reposicoesQueNaoAconteceram,
  type MatriculadoNaAula,
  type RespostaChamada,
} from '@/dominio/presencas/registro'
import type { OrigemAusencia } from '@/dominio/tipos'
import type { StatusReposicao } from '@/dominio/reposicoes/agendamento'

/**
 * A gravação de uma chamada, num lugar só. Eram duas cópias — o link da aula e
 * o link permanente do professor — e nenhuma sabia desfazer: chamada regravada
 * mantinha a reposição de uma falta já corrigida. Agora a gestora também
 * corrige direto, e as três rotas passam por aqui (pedido do tio, 13/10/2026).
 *
 * Primeiro confere (`planejarCorrecao`), depois grava. Gravar de novo a mesma
 * chamada dá o mesmo resultado, então uma falha no meio se resolve repetindo.
 */
export async function gravarChamada(
  db: SupabaseClient,
  entrada: {
    aulaId: number
    professorId: number | null
    matriculados: MatriculadoNaAula[]
    respostas: RespostaChamada[]
    /** Quem gravou, para o log. */
    usuario: string
    /** Por onde: link da aula, link permanente ou a gestora. */
    via: 'link_da_aula' | 'link_permanente' | 'gestora'
  },
): Promise<{ ok: true; ausentes: string[] } | { ok: false; motivo: string }> {
  const { aulaId } = entrada

  const falha = (e: { message: string } | null, o: string) =>
    e ? ({ ok: false, motivo: `${o}: ${e.message}` } as const) : null

  // ── O que já existe nesta aula ────────────────────────────────────────────
  const [rPresencas, rPendencias, rReposicoes] = await Promise.all([
    db
      .from('presencas')
      .select('aluno_id, presente, registrado_por, conta_pagar_id, aluno:alunos!aluno_id (nome)')
      .eq('aula_id', aulaId),
    db.from('pendencias_reposicao').select('id, aluno_id, origem, status').eq('aula_origem_id', aulaId),
    db.from('pendencias_reposicao').select('id, aluno_id, status').eq('aula_reposicao_id', aulaId),
  ])
  const erroLeitura = falha(rPresencas.error ?? rPendencias.error ?? rReposicoes.error, 'Falha ao conferir a chamada')
  if (erroLeitura) return erroLeitura

  const idsPendencias = (rPendencias.data ?? []).map((p) => p.id as number)
  const [rCreditos, rPagas] = idsPendencias.length
    ? await Promise.all([
        db.from('creditos').select('pendencia_id').in('pendencia_id', idsPendencias),
        db
          .from('itens_conta_pagar_professor')
          .select('pendencia_id, conta:contas_pagar_professor!inner (status)')
          .in('pendencia_id', idsPendencias)
          // Etapa 7 (decisao 3): o rascunho do pagamento nao trava.
          .neq('conta.status', 'Rascunho'),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  const erroExtras = falha(rCreditos.error ?? rPagas.error, 'Falha ao conferir a chamada')
  if (erroExtras) return erroExtras

  const comCredito = new Set((rCreditos.data ?? []).map((c) => c.pendencia_id as number))
  const pagas = new Set((rPagas.data ?? []).map((c) => c.pendencia_id as number))

  const atuais = (rPresencas.data ?? []).map((p) => ({
    aluno_id: p.aluno_id as number,
    nome: (p.aluno as unknown as { nome: string } | null)?.nome ?? 'Aluno',
    presente: p.presente as boolean,
    conta_pagar_id: p.conta_pagar_id as number | null,
    registrado_por: p.registrado_por as number | null,
  }))
  const pendencias: PendenciaDaAula[] = (rPendencias.data ?? []).map((p) => ({
    id: p.id as number,
    aluno_id: p.aluno_id as number,
    origem: p.origem as OrigemAusencia,
    status: p.status as StatusReposicao,
    temCredito: comCredito.has(p.id as number),
    pagoAoProfessor: pagas.has(p.id as number),
  }))

  const resultado = montarRegistro({
    aulaId,
    professorId: entrada.professorId,
    matriculados: entrada.matriculados,
    respostas: entrada.respostas,
  })

  const plano = planejarCorrecao({
    atuais,
    novas: resultado.presencas,
    pendencias,
    reposicoes: (rReposicoes.data ?? []).map((r) => ({
      id: r.id as number,
      aluno_id: r.aluno_id as number,
      status: r.status as StatusReposicao,
    })),
  })
  if (plano.erros.length > 0) return { ok: false, motivo: plano.erros.join(' ') }

  // ── Grava ─────────────────────────────────────────────────────────────────
  if (plano.removerPendencias.length > 0) {
    const { error } = await db.from('pendencias_reposicao').delete().in('id', plano.removerPendencias)
    const f = falha(error, 'Falha ao desfazer a reposição da falta corrigida')
    if (f) return f
  }
  // Faltou à própria reposição: a mesma pendência volta para a lista de
  // pendentes (Julio, 20/10/2026), com a aula e a matrícula de reposição
  // guardadas — remarcar ou desistir limpa a matrícula antiga, e a cobrança e
  // o pagamento já ignoram quem não tem presença.
  const naoAconteceram = [
    ...new Set([
      ...plano.reabrirReposicoes,
      ...reposicoesQueNaoAconteceram(
        (rReposicoes.data ?? []).map((r) => ({
          id: r.id as number,
          aluno_id: r.aluno_id as number,
          status: r.status as StatusReposicao,
        })),
        resultado.presencas,
      ),
    ]),
  ]
  if (naoAconteceram.length > 0) {
    const { error } = await db
      .from('pendencias_reposicao')
      .update({ status: 'Pendente' })
      .in('id', naoAconteceram)
    const f = falha(error, 'Falha ao reabrir a reposição')
    if (f) return f
  }

  // Corrigir nao troca quem registrou: o professor continua sendo o autor.
  const autor = new Map(atuais.map((a) => [a.aluno_id, a.registrado_por]))
  const presencas = resultado.presencas.map((p) =>
    entrada.professorId === null && autor.has(p.aluno_id)
      ? { ...p, registrado_por: autor.get(p.aluno_id) ?? null }
      : p,
  )

  if (presencas.length > 0) {
    const { error } = await db.from('presencas').upsert(presencas, { onConflict: 'aula_id,aluno_id' })
    const f = falha(error, 'Falha ao gravar as presenças')
    if (f) return f
  }

  if (resultado.pendencias.length > 0) {
    const { error } = await db
      .from('pendencias_reposicao')
      .upsert(resultado.pendencias, { onConflict: 'aluno_id,aula_origem_id', ignoreDuplicates: true })
    const f = falha(error, 'Falha ao registrar as reposições')
    if (f) return f
  }

  await concluirReposicoes(db, aulaId, presencas)

  // Aula excluida no meio da chamada continua excluida (Rodada 4).
  await db.from('aulas').update({ status: resultado.novoStatusAula }).eq('id', aulaId).neq('status', 'Excluída')

  await db.from('logs_operacionais').insert({
    acao: atuais.length > 0 ? 'corrigir_chamada' : 'registrar_chamada',
    entidade: 'aulas',
    entidade_id: aulaId,
    usuario: entrada.usuario,
    detalhe: {
      via: entrada.via,
      presencas: presencas.length,
      ausentes: resultado.ausentes.length,
      pendencias_geradas: resultado.pendencias.length,
      pendencias_desfeitas: plano.removerPendencias.length,
      reposicoes_reabertas: naoAconteceram.length,
    },
  })

  return { ok: true, ausentes: resultado.ausentes.map((a) => a.nome) }
}
