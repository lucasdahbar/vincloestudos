import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { carregarVigencias } from './vigencias'
import { deNumeric, paraNumeric } from '@/dominio/dinheiro'
import { creditoAoRealizar } from '@/dominio/reposicoes/credito-da-diferenca'
import { saldoDoCredito } from '@/dominio/creditos/saldo'

/**
 * Reposicao em turma mais barata (Julio, 24/11/2026): o credito da diferenca
 * nasce com a presenca na reposicao e sai se ela deixa de ter acontecido. A
 * regra mora em `dominio/reposicoes/credito-da-diferenca.ts`.
 *
 * Recebe o `db` de quem grava a chamada: o link do professor nao tem sessao de
 * gestora. Uma falha aqui nao desfaz a chamada; volta como motivo, para o log.
 */

const dia = (v: unknown) => String(v).slice(0, 10)
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export async function creditarReposicoesFeitas(
  db: SupabaseClient,
  aulaId: number,
  vieram: number[],
): Promise<{ ok: boolean; motivo?: string }> {
  if (vieram.length === 0) return { ok: true }
  const { data, error } = await db
    .from('pendencias_reposicao')
    .select(
      'id, aluno_id, aluno:alunos!aluno_id (nome, responsavel_id), aula_origem:aulas!aula_origem_id (servico_id, data_hora_referencia), aula_reposicao:aulas!aula_reposicao_id (servico_id, data_hora_referencia, turma:turmas!turma_id (nome))',
    )
    .eq('aula_reposicao_id', aulaId)
    .eq('status', 'Realizada')
    .eq('credito_diferenca', true)
    .is('credito_diferenca_id', null)
    .in('aluno_id', vieram)
  if (error) return { ok: false, motivo: error.message }
  if (!data || data.length === 0) return { ok: true }

  const vigencias = await carregarVigencias(db)
  for (const p of data as unknown as {
    id: number
    aluno_id: number
    aluno: { nome: string; responsavel_id: number } | null
    aula_origem: { servico_id: number; data_hora_referencia: string } | null
    aula_reposicao: { servico_id: number; data_hora_referencia: string; turma: { nome: string } | null } | null
  }[]) {
    if (!p.aluno || !p.aula_origem || !p.aula_reposicao) continue
    const origem = dia(p.aula_origem.data_hora_referencia)
    const destino = dia(p.aula_reposicao.data_hora_referencia)
    const valor = creditoAoRealizar({
      decisao: true,
      jaTemCredito: false,
      valorOrigem: vigencias.valorServico(p.aula_origem.servico_id, origem),
      valorDestino: vigencias.valorServico(p.aula_reposicao.servico_id, destino),
    })
    if (valor === 0) continue

    const { data: credito, error: erroCredito } = await db
      .from('creditos')
      .insert({
        responsavel_id: p.aluno.responsavel_id,
        aluno_id: p.aluno_id,
        valor: paraNumeric(valor),
        descricao: `${p.aluno.nome} repôs a aula de ${ddmm(origem)} em ${ddmm(destino)} (${p.aula_reposicao.turma?.nome ?? 'turma'}), que custa menos.`,
      })
      .select('id')
      .single()
    if (erroCredito) return { ok: false, motivo: erroCredito.message }

    // So liga se ninguem ligou antes (duas gravacoes da mesma chamada ao mesmo tempo).
    const { data: ligada, error: erroLigar } = await db
      .from('pendencias_reposicao')
      .update({ credito_diferenca_id: credito.id })
      .eq('id', p.id)
      .is('credito_diferenca_id', null)
      .select('id')
    if (erroLigar || !ligada || ligada.length === 0) {
      await db.from('creditos').delete().eq('id', credito.id)
      if (erroLigar) return { ok: false, motivo: erroLigar.message }
    }
  }
  return { ok: true }
}

/**
 * A reposicao deixou de ter acontecido (falta nela, chamada corrigida): o que
 * sobra do credito e estornado e ele sai da pendencia, para nascer de novo se
 * a reposicao for remarcada e feita. O ja usado (abatido, devolvido) fica.
 */
export async function estornarCreditoDaReposicao(
  db: SupabaseClient,
  pendencias: number[],
  usuario: string,
): Promise<{ ok: boolean; motivo?: string }> {
  if (pendencias.length === 0) return { ok: true }
  const { data, error } = await db
    .from('pendencias_reposicao')
    .select('id, credito_diferenca_id, credito:creditos!credito_diferenca_id (valor, usos:usos_credito (valor))')
    .in('id', pendencias)
    .not('credito_diferenca_id', 'is', null)
  if (error) return { ok: false, motivo: error.message }

  for (const p of (data ?? []) as unknown as {
    id: number
    credito_diferenca_id: number
    credito: { valor: string; usos: { valor: string }[] | null } | null
  }[]) {
    if (p.credito) {
      const saldo = saldoDoCredito(deNumeric(p.credito.valor), (p.credito.usos ?? []).map((u) => deNumeric(u.valor)))
      if (saldo > 0) {
        const { error: erroUso } = await db.from('usos_credito').insert({
          credito_id: p.credito_diferenca_id,
          tipo: 'Cancelamento',
          valor: paraNumeric(saldo),
          observacao: 'A reposição na turma mais barata deixou de constar como feita.',
          registrado_por: usuario,
        })
        if (erroUso) return { ok: false, motivo: erroUso.message }
      }
    }
    const { error: erroSoltar } = await db.from('pendencias_reposicao').update({ credito_diferenca_id: null }).eq('id', p.id)
    if (erroSoltar) return { ok: false, motivo: erroSoltar.message }
  }
  return { ok: true }
}
