import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import {
  saldoEStatus,
  statusAposCancelarRecebimento,
  validarCancelamentoRecebimento,
  validarRecebimento,
  type StatusCobranca,
} from '@/dominio/recebimentos/quitacao'

export async function registrarRecebimento(entrada: {
  cobrancaId: number
  valor: Centavos
  data: string
  contaId: number | null
  formaPagamento: string | null
  observacao: string | null
  usuario: string
}): Promise<{ ok: boolean; erros?: string[]; saldo?: Centavos; recebimentoId?: number }> {
  const supabase = await clienteServidor()

  const { data: cobranca } = await supabase
    .from('cobrancas')
    .select('id, valor_total, status')
    .eq('id', entrada.cobrancaId)
    .maybeSingle()

  if (!cobranca) return { ok: false, erros: ['Cobrança não encontrada.'] }

  const { data: anteriores } = await supabase
    .from('recebimentos')
    .select('valor_recebido')
    .eq('cobranca_id', entrada.cobrancaId)

  const total = deNumeric(cobranca.valor_total)
  const jaRecebidos = (anteriores ?? []).map((r) => deNumeric(r.valor_recebido))
  const { saldo } = saldoEStatus(total, jaRecebidos, cobranca.status as StatusCobranca)

  const erros = validarRecebimento(entrada.valor, saldo, entrada.contaId)
  if (erros.length > 0) return { ok: false, erros }

  const { data: inserido, error } = await supabase
    .from('recebimentos')
    .insert({
      cobranca_id: entrada.cobrancaId,
      valor_recebido: paraNumeric(entrada.valor),
      data_recebimento: entrada.data,
      conta_id: entrada.contaId,
      forma_pagamento: entrada.formaPagamento,
      observacao: entrada.observacao,
      registrado_por: entrada.usuario,
    })
    .select('id')
    .single()

  if (error) return { ok: false, erros: [error.message] }

  const novo = saldoEStatus(total, [...jaRecebidos, entrada.valor], cobranca.status as StatusCobranca)
  await supabase.from('cobrancas').update({ status: novo.status }).eq('id', entrada.cobrancaId)

  await supabase.from('logs_operacionais').insert({
    acao: 'registrar_recebimento',
    entidade: 'cobrancas',
    entidade_id: entrada.cobrancaId,
    usuario: entrada.usuario,
    detalhe: { valor: entrada.valor, saldo_restante: novo.saldo, status: novo.status },
  })

  return { ok: true, saldo: novo.saldo, recebimentoId: inserido.id as number }
}

/**
 * Tela de confirmacao da baixa (pedido do Julio, 09/11/2026): antes, a tela so
 * recarregava, e no pagamento parcial o formulario ficava igual, com o mesmo
 * valor, parecendo que nada tinha sido salvo. A confirmacao le o que foi
 * gravado de fato, e nao o que foi digitado: e a prova de que a baixa entrou.
 */
export async function obterRecebimento(id: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('recebimentos')
    .select(
      'id, cobranca_id, valor_recebido, data_recebimento, forma_pagamento, conta:contas!conta_id (nome), ' +
        'cobranca:cobrancas!cobranca_id (valor_total, status, mes_referencia, responsavel:responsaveis!responsavel_id (nome))',
    )
    .eq('id', id)
    .maybeSingle()
  if (!data) return null

  const r = data as unknown as {
    id: number
    cobranca_id: number
    valor_recebido: string
    data_recebimento: string
    forma_pagamento: string | null
    conta: { nome: string } | null
    cobranca: {
      valor_total: string
      status: StatusCobranca
      mes_referencia: string
      responsavel: { nome: string } | null
    }
  }

  const { data: todos } = await supabase
    .from('recebimentos')
    .select('valor_recebido')
    .eq('cobranca_id', r.cobranca_id)
  const { saldo } = saldoEStatus(
    deNumeric(r.cobranca.valor_total),
    (todos ?? []).map((x) => deNumeric(x.valor_recebido)),
    r.cobranca.status,
  )

  return {
    id: r.id,
    cobrancaId: r.cobranca_id,
    valor: deNumeric(r.valor_recebido),
    data: r.data_recebimento,
    forma: r.forma_pagamento,
    conta: r.conta?.nome ?? null,
    responsavel: r.cobranca.responsavel?.nome ?? '',
    mes: r.cobranca.mes_referencia,
    status: r.cobranca.status,
    saldo,
  }
}

export async function recebimentosDaCobranca(cobrancaId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('recebimentos')
    .select('id, valor_recebido, data_recebimento, forma_pagamento, observacao, conta:contas!conta_id (nome)')
    .eq('cobranca_id', cobrancaId)
    .order('data_recebimento')

  return ((data ?? []) as unknown as {
    id: number
    valor_recebido: string
    data_recebimento: string
    forma_pagamento: string | null
    observacao: string | null
    conta: { nome: string } | null
  }[]).map((r) => ({ ...r, valor_recebido: deNumeric(r.valor_recebido) }))
}

/**
 * Cancela um recebimento lancado errado (pedido do Julio, 09/11/2026).
 *
 * O registro e apagado, e nao marcado como cancelado: um recebimento marcado
 * teria de ser ignorado em cada soma (lista, saldo, credito, travas do rascunho
 * nas funcoes do banco), e bastaria esquecer uma para o saldo mentir. O log
 * guarda a linha inteira, quem cancelou e o motivo.
 *
 * Se era abatimento de credito, o uso cai junto (on delete cascade) e o saldo
 * do credito, que e calculado dos usos, volta sozinho.
 */
export async function cancelarRecebimento(entrada: {
  recebimentoId: number
  motivo: string
  usuario: string
}): Promise<{ ok: boolean; erros?: string[]; cobrancaId?: number }> {
  const supabase = await clienteServidor()

  const { data: recebimento } = await supabase
    .from('recebimentos')
    .select('*, cobranca:cobrancas!cobranca_id (id, valor_total, status)')
    .eq('id', entrada.recebimentoId)
    .maybeSingle()
  if (!recebimento) return { ok: false, erros: ['Recebimento não encontrado. Ele pode já ter sido cancelado.'] }

  const cobranca = recebimento.cobranca as unknown as {
    id: number
    valor_total: string
    status: StatusCobranca | 'Cancelada'
  }
  const erros = validarCancelamentoRecebimento(entrada.motivo, cobranca.status)
  if (erros.length > 0) return { ok: false, erros }

  const { data: uso } = await supabase
    .from('usos_credito')
    .select('id, credito_id, valor')
    .eq('recebimento_id', entrada.recebimentoId)
    .maybeSingle()

  const { error } = await supabase.from('recebimentos').delete().eq('id', entrada.recebimentoId)
  if (error) return { ok: false, erros: [error.message] }

  // Le o que sobrou depois de apagar: outro recebimento lancado no meio entra na conta.
  const { data: restantes } = await supabase
    .from('recebimentos')
    .select('valor_recebido')
    .eq('cobranca_id', cobranca.id)
  const novo = statusAposCancelarRecebimento(
    deNumeric(cobranca.valor_total),
    (restantes ?? []).map((r) => deNumeric(r.valor_recebido)),
    cobranca.status as StatusCobranca,
  )
  await supabase.from('cobrancas').update({ status: novo.status }).eq('id', cobranca.id)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cobranca: _cobranca, ...linha } = recebimento
  await supabase.from('logs_operacionais').insert({
    acao: 'cancelar_recebimento',
    entidade: 'cobrancas',
    entidade_id: cobranca.id,
    usuario: entrada.usuario,
    detalhe: {
      motivo: entrada.motivo.trim(),
      recebimento: linha,
      credito_devolvido: uso ?? null,
      saldo_restante: novo.saldo,
      status: novo.status,
    },
  })

  return { ok: true, cobrancaId: cobranca.id }
}
