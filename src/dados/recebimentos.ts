import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import { saldoEStatus, validarRecebimento, type StatusCobranca } from '@/dominio/recebimentos/quitacao'

export async function registrarRecebimento(entrada: {
  cobrancaId: number
  valor: Centavos
  data: string
  contaId: number | null
  formaPagamento: string | null
  observacao: string | null
  usuario: string
}): Promise<{ ok: boolean; erros?: string[]; saldo?: Centavos }> {
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

  const { error } = await supabase.from('recebimentos').insert({
    cobranca_id: entrada.cobrancaId,
    valor_recebido: paraNumeric(entrada.valor),
    data_recebimento: entrada.data,
    conta_id: entrada.contaId,
    forma_pagamento: entrada.formaPagamento,
    observacao: entrada.observacao,
    registrado_por: entrada.usuario,
  })

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

  return { ok: true, saldo: novo.saldo }
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
