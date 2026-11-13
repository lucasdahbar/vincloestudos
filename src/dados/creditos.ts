import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import { saldoDoCredito, validarAbatimento, validarCancelamento, validarDevolucao } from '@/dominio/creditos/saldo'
import { acertoDaSaida } from '@/dominio/creditos/saida'
import { refazerTextoDaCobranca } from './cobrancas'
import type { StatusCobranca as StatusDoItem } from '@/dominio/reposicoes/desfecho'
import { saldoEStatus, type StatusCobranca } from '@/dominio/recebimentos/quitacao'

/**
 * Rodada 3: créditos do responsável — aula já cobrada que a gestora decidiu
 * não cobrar. A regra das decisões mora em `dominio/creditos/saldo.ts`.
 */

/** Cobranças em que ainda cabe abater: geradas e não quitadas nem canceladas. */
const COBRANCA_ABERTA: StatusCobranca[] = ['Rascunho', 'Confirmada', 'Enviada', 'Parcial']

export interface CreditoListado {
  id: number
  responsavel_id: number
  responsavel_nome: string
  aluno_nome: string | null
  descricao: string
  valor: Centavos
  saldo: Centavos
  criado_em: string
  usos: { tipo: 'Abatimento' | 'Devolução' | 'Cancelamento'; valor: Centavos; data: string }[]
  /** Cobranças do mesmo responsável em que dá para abater, com o que devem. */
  cobrancasAbertas: { id: number; mes_referencia: string; saldo: Centavos }[]
}

export async function listarCreditos(): Promise<CreditoListado[]> {
  const supabase = await clienteServidor()
  const { data: creditos, error } = await supabase
    .from('creditos')
    .select(
      'id, responsavel_id, valor, descricao, created_at, responsavel:responsaveis!responsavel_id (nome), aluno:alunos!aluno_id (nome), usos:usos_credito (tipo, valor, data)',
    )
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Falha ao listar créditos: ${error.message}`)

  const linhas = (creditos ?? []) as unknown as {
    id: number
    responsavel_id: number
    valor: string
    descricao: string
    created_at: string
    responsavel: { nome: string } | null
    aluno: { nome: string } | null
    usos: { tipo: 'Abatimento' | 'Devolução' | 'Cancelamento'; valor: string; data: string }[]
  }[]

  const responsaveis = [...new Set(linhas.map((c) => c.responsavel_id))]
  const abertas = responsaveis.length ? await cobrancasAbertas(responsaveis) : new Map()

  return linhas.map((c) => {
    const usos = c.usos.map((u) => ({ ...u, valor: deNumeric(u.valor) }))
    const valor = deNumeric(c.valor)
    return {
      id: c.id,
      responsavel_id: c.responsavel_id,
      responsavel_nome: c.responsavel?.nome ?? 'Responsável',
      aluno_nome: c.aluno?.nome ?? null,
      descricao: c.descricao,
      valor,
      saldo: saldoDoCredito(valor, usos.map((u) => u.valor)),
      criado_em: c.created_at,
      usos,
      cobrancasAbertas: abertas.get(c.responsavel_id) ?? [],
    }
  })
}

async function cobrancasAbertas(
  responsaveis: number[],
): Promise<Map<number, { id: number; mes_referencia: string; saldo: Centavos }[]>> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('cobrancas')
    .select('id, responsavel_id, mes_referencia, valor_total, status, recebimentos (valor_recebido)')
    .in('responsavel_id', responsaveis)
    .in('status', COBRANCA_ABERTA)
    .order('mes_referencia')

  const mapa = new Map<number, { id: number; mes_referencia: string; saldo: Centavos }[]>()
  for (const c of (data ?? []) as unknown as {
    id: number
    responsavel_id: number
    mes_referencia: string
    valor_total: string
    status: StatusCobranca
    recebimentos: { valor_recebido: string }[]
  }[]) {
    const { saldo } = saldoEStatus(
      deNumeric(c.valor_total),
      c.recebimentos.map((r) => deNumeric(r.valor_recebido)),
      c.status,
    )
    if (saldo <= 0) continue
    mapa.set(c.responsavel_id, [
      ...(mapa.get(c.responsavel_id) ?? []),
      { id: c.id, mes_referencia: c.mes_referencia, saldo },
    ])
  }
  return mapa
}

async function saldoAtual(creditoId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('creditos')
    .select('id, responsavel_id, valor, usos:usos_credito (valor)')
    .eq('id', creditoId)
    .maybeSingle()
  if (!data) return null
  const usos = (data.usos as unknown as { valor: string }[]).map((u) => deNumeric(u.valor))
  return {
    responsavel_id: data.responsavel_id as number,
    saldo: saldoDoCredito(deNumeric(data.valor), usos),
  }
}

/**
 * Abate o crédito de uma cobrança do mesmo responsável. Vira um recebimento
 * com forma "Crédito" e sem conta bancária: a cobrança fica Parcial ou
 * Quitada pela mesma regra de um pagamento comum.
 */
export async function abaterCredito(entrada: {
  creditoId: number
  cobrancaId: number
  valor: Centavos
  usuario: string
}): Promise<{ ok: boolean; erros?: string[] }> {
  const supabase = await clienteServidor()
  const credito = await saldoAtual(entrada.creditoId)
  if (!credito) return { ok: false, erros: ['Crédito não encontrado.'] }

  const [{ data: cobranca }, { data: anteriores }] = await Promise.all([
    supabase
      .from('cobrancas')
      .select('id, responsavel_id, valor_total, status, mes_referencia')
      .eq('id', entrada.cobrancaId)
      .maybeSingle(),
    supabase.from('recebimentos').select('valor_recebido').eq('cobranca_id', entrada.cobrancaId),
  ])

  if (!cobranca) return { ok: false, erros: ['Cobrança não encontrada.'] }
  if (cobranca.responsavel_id !== credito.responsavel_id) {
    return { ok: false, erros: ['O crédito é de outro responsável.'] }
  }
  if (!COBRANCA_ABERTA.includes(cobranca.status as StatusCobranca)) {
    return { ok: false, erros: ['Esta cobrança não está em aberto.'] }
  }

  const total = deNumeric(cobranca.valor_total)
  const jaRecebidos = (anteriores ?? []).map((r) => deNumeric(r.valor_recebido))
  const { saldo: saldoCobranca } = saldoEStatus(total, jaRecebidos, cobranca.status as StatusCobranca)

  const erros = validarAbatimento({
    valor: entrada.valor,
    saldoCredito: credito.saldo,
    saldoCobranca,
  })
  if (erros.length > 0) return { ok: false, erros }

  const { data: recebimento, error } = await supabase
    .from('recebimentos')
    .insert({
      cobranca_id: entrada.cobrancaId,
      valor_recebido: paraNumeric(entrada.valor),
      data_recebimento: new Date().toISOString().slice(0, 10),
      conta_id: null,
      forma_pagamento: 'Crédito',
      observacao: `Abatimento do crédito nº ${entrada.creditoId}`,
      registrado_por: entrada.usuario,
    })
    .select('id')
    .single()

  if (error) return { ok: false, erros: [error.message] }

  const { error: erroUso } = await supabase.from('usos_credito').insert({
    credito_id: entrada.creditoId,
    tipo: 'Abatimento',
    valor: paraNumeric(entrada.valor),
    recebimento_id: recebimento.id,
    registrado_por: entrada.usuario,
  })

  if (erroUso) {
    // Sem o uso, o crédito continuaria com o saldo cheio: desfaz o recebimento.
    await supabase.from('recebimentos').delete().eq('id', recebimento.id)
    return { ok: false, erros: [erroUso.message] }
  }

  const novo = saldoEStatus(total, [...jaRecebidos, entrada.valor], cobranca.status as StatusCobranca)
  await supabase.from('cobrancas').update({ status: novo.status }).eq('id', entrada.cobrancaId)

  await supabase.from('logs_operacionais').insert({
    acao: 'abater_credito',
    entidade: 'creditos',
    entidade_id: entrada.creditoId,
    usuario: entrada.usuario,
    detalhe: { cobranca_id: entrada.cobrancaId, valor: entrada.valor },
  })

  return { ok: true }
}

/** Devolve o crédito, ou parte dele, em dinheiro ao responsável. */
export async function devolverCredito(entrada: {
  creditoId: number
  valor: Centavos
  contaId: number | null
  observacao: string | null
  usuario: string
}): Promise<{ ok: boolean; erros?: string[] }> {
  const supabase = await clienteServidor()
  const credito = await saldoAtual(entrada.creditoId)
  if (!credito) return { ok: false, erros: ['Crédito não encontrado.'] }

  const erros = validarDevolucao({ valor: entrada.valor, saldoCredito: credito.saldo })
  if (erros.length > 0) return { ok: false, erros }

  const { error } = await supabase.from('usos_credito').insert({
    credito_id: entrada.creditoId,
    tipo: 'Devolução',
    valor: paraNumeric(entrada.valor),
    conta_id: entrada.contaId,
    observacao: entrada.observacao,
    registrado_por: entrada.usuario,
  })

  if (error) return { ok: false, erros: [error.message] }

  await supabase.from('logs_operacionais').insert({
    acao: 'devolver_credito',
    entidade: 'creditos',
    entidade_id: entrada.creditoId,
    usuario: entrada.usuario,
    detalhe: { valor: entrada.valor, conta_id: entrada.contaId },
  })

  return { ok: true }
}

/**
 * Cancela o saldo inteiro do crédito (pedido do Julio, 28/10/2026). Fica no
 * histórico como um uso, com o motivo, para a conta fechar.
 */
export async function cancelarCredito(entrada: {
  creditoId: number
  motivo: string
  usuario: string
}): Promise<{ ok: boolean; erros?: string[] }> {
  const supabase = await clienteServidor()
  const credito = await saldoAtual(entrada.creditoId)
  if (!credito) return { ok: false, erros: ['Crédito não encontrado.'] }

  const erros = validarCancelamento({ saldoCredito: credito.saldo, motivo: entrada.motivo })
  if (erros.length > 0) return { ok: false, erros }

  const { error } = await supabase.from('usos_credito').insert({
    credito_id: entrada.creditoId,
    tipo: 'Cancelamento',
    valor: paraNumeric(credito.saldo),
    observacao: entrada.motivo.trim(),
    registrado_por: entrada.usuario,
  })
  if (error) return { ok: false, erros: [error.message] }

  await supabase.from('logs_operacionais').insert({
    acao: 'cancelar_credito',
    entidade: 'creditos',
    entidade_id: entrada.creditoId,
    usuario: entrada.usuario,
    detalhe: { valor: credito.saldo, motivo: entrada.motivo.trim() },
  })
  return { ok: true }
}

/**
 * Decisão 11 (28/10/2026) e opção A (13/11/2026): depois que a matrícula do
 * aluno encolhe ou sai, as aulas da turma que ficaram fora dela saem da
 * cobrança se ela ainda não teve pagamento; se já teve, viram crédito.
 * A regra mora em `dominio/creditos/saida.ts`.
 */
export async function acertarCobrancasDaSaida(
  alunoId: number,
  turmaId: number,
): Promise<{
  ok: boolean
  creditado: Centavos
  aulasCreditadas: number
  tiradas: number
  /** Cobranças já mandadas que mudaram e precisam ser reenviadas. */
  reenviar: number
  erros?: string[]
}> {
  const supabase = await clienteServidor()
  const [{ data: aluno }, { data: turma }, { data: matriculas }, { data: itens, error }, { data: creditos }] =
    await Promise.all([
      supabase.from('alunos').select('nome, responsavel_id').eq('id', alunoId).maybeSingle(),
      supabase.from('turmas').select('nome').eq('id', turmaId).maybeSingle(),
      supabase.from('matriculas').select('data_inicio, data_fim').eq('aluno_id', alunoId).eq('turma_id', turmaId),
      supabase
        .from('itens_cobranca')
        .select('id, aula_id, valor_final, cobranca:cobrancas!cobranca_id (id, status, recebimentos (id)), aula:aulas!inner (turma_id, data_hora_referencia)')
        .eq('aluno_id', alunoId)
        .eq('aula.turma_id', turmaId),
      supabase
        .from('creditos')
        .select('item_cobranca_id, pendencia:pendencias_reposicao!pendencia_id (aula_origem_id)')
        .eq('aluno_id', alunoId),
    ])

  const vazio = { creditado: 0, aulasCreditadas: 0, tiradas: 0, reenviar: 0 }
  if (error) return { ok: false, ...vazio, erros: [error.message] }
  if (!aluno) return { ok: false, ...vazio, erros: ['Aluno não encontrado.'] }

  const jaCreditados = new Set((creditos ?? []).map((c) => c.item_cobranca_id).filter((x) => x !== null))
  const aulasCreditadas = new Set(
    (creditos ?? [])
      .map((c) => (c.pendencia as unknown as { aula_origem_id: number } | null)?.aula_origem_id)
      .filter((x) => x !== undefined),
  )
  const dia = (v: unknown) => String(v).slice(0, 10)

  const acerto = acertoDaSaida(
    (itens ?? []).map((i) => ({
      id: i.id,
      aula_id: i.aula_id,
      data: dia((i.aula as unknown as { data_hora_referencia: string }).data_hora_referencia),
      valor_final: deNumeric(i.valor_final),
      cobranca_status: (i.cobranca as unknown as { status: StatusDoItem }).status,
      temRecebimento: ((i.cobranca as unknown as { recebimentos: unknown[] | null }).recebimentos ?? []).length > 0,
      jaVirouCredito: jaCreditados.has(i.id) || aulasCreditadas.has(i.aula_id),
    })),
    (matriculas ?? []).map((m) => ({ data_inicio: dia(m.data_inicio), data_fim: m.data_fim ? dia(m.data_fim) : null })),
  )

  // Mesmo caminho do aviso (opcao A, 13/11/2026): a funcao do banco confere
  // sob lock que a cobranca segue sem pagamento; se entrou um recebimento no
  // meio, devolve null e a aula segue para o credito.
  let tiradas = 0
  const creditar = [...acerto.creditar]
  // Cobrancas ja mandadas que mudaram: texto refeito, e a Kelly reenvia.
  const paraReenviar = new Set<number>()
  const refazerTexto = new Set<number>()
  for (const id of acerto.tirar) {
    const { data: ficou, error: erroRpc } = await supabase.rpc('tirar_item_de_cobranca_em_aberto', {
      p_item_id: id,
    })
    if (erroRpc) return { ok: false, ...vazio, tiradas, reenviar: paraReenviar.size, erros: [erroRpc.message] }
    const cobranca = (itens ?? []).find((x) => x.id === id)!.cobranca as unknown as { id: number; status: StatusDoItem }
    if (ficou) {
      tiradas++
      if (cobranca.status !== 'Rascunho') paraReenviar.add(cobranca.id)
      if (ficou === 'Confirmada') refazerTexto.add(cobranca.id)
      else refazerTexto.delete(cobranca.id)
    } else {
      const i = (itens ?? []).find((x) => x.id === id)!
      const valor = deNumeric(i.valor_final)
      const data = dia((i.aula as unknown as { data_hora_referencia: string }).data_hora_referencia)
      if (valor > 0) creditar.push({ item_id: id, aula_id: i.aula_id, data, valor })
    }
  }

  for (const cobrancaId of refazerTexto) {
    const r = await refazerTextoDaCobranca(cobrancaId)
    if (!r.ok) {
      return {
        ok: false,
        ...vazio,
        tiradas,
        reenviar: paraReenviar.size,
        erros: [`A aula saiu da cobrança, mas o texto do WhatsApp não foi refeito: ${r.motivo}`],
      }
    }
  }

  if (creditar.length > 0) {
    const nomeTurma = turma?.nome ?? 'turma'
    const { error: erroCredito } = await supabase.from('creditos').insert(
      creditar.map((c) => ({
        responsavel_id: aluno.responsavel_id,
        aluno_id: alunoId,
        item_cobranca_id: c.item_id,
        valor: paraNumeric(c.valor),
        descricao: `${aluno.nome} saiu da turma (${nomeTurma}), e a aula de ${c.data.slice(8, 10)}/${c.data.slice(5, 7)} já tinha sido cobrada.`,
      })),
    )
    if (erroCredito) return { ok: false, ...vazio, tiradas, reenviar: paraReenviar.size, erros: [`O crédito falhou: ${erroCredito.message}`] }
  }

  return {
    ok: true,
    creditado: creditar.reduce((t, c) => t + c.valor, 0),
    aulasCreditadas: creditar.length,
    tiradas,
    reenviar: paraReenviar.size,
  }
}
