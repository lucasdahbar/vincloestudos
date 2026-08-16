import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import { carregarVigencias } from './vigencias'
import { calcularFechamento, type PresencaRemunerada } from '@/dominio/pagamentos/fechamento'

/**
 * Levanta as presenças confirmadas do professor no período, com o valor do
 * serviço e o percentual VIGENTES NA DATA DE CADA AULA.
 */
export async function previaFechamento(professorId: number, de: string, ate: string) {
  const supabase = await clienteServidor()

  const { data: presencas } = await supabase
    .from('presencas')
    .select(`
      id, presente, flag_reposicao, aluno_id,
      aluno:alunos!aluno_id (nome),
      aula:aulas!aula_id (
        id, data_hora_inicio, turma_id,
        turma:turmas!turma_id (id, nome, servico_id, professor_id)
      )
    `)
    .eq('presente', true)

  const linhas = ((presencas ?? []) as unknown as {
    id: number
    presente: boolean
    flag_reposicao: boolean
    aluno_id: number
    aluno: { nome: string } | null
    aula: {
      id: number
      data_hora_inicio: string
      turma_id: number
      turma: { id: number; nome: string; servico_id: number; professor_id: number } | null
    } | null
  }[]).filter((p) => {
    const dia = p.aula?.data_hora_inicio.slice(0, 10) ?? ''
    return p.aula?.turma?.professor_id === professorId && dia >= de && dia <= ate
  })

  const { data: jaPagas } = await supabase.from('itens_conta_pagar_professor').select('presenca_id')
  const pagas = new Set((jaPagas ?? []).map((i) => i.presenca_id))

  const vigencias = await carregarVigencias()

  const remuneradas: PresencaRemunerada[] = linhas.map((p) => {
    const dia = p.aula!.data_hora_inicio.slice(0, 10)
    return {
      presenca_id: p.id,
      aluno_id: p.aluno_id,
      aluno_nome: p.aluno?.nome ?? 'Aluno',
      turma_id: p.aula!.turma!.id,
      turma_nome: p.aula!.turma!.nome,
      data_aula: dia,
      presente: true,
      flag_reposicao: p.flag_reposicao,
      valor_servico: vigencias.valorServico(p.aula!.turma!.servico_id, dia),
      percentual: vigencias.percentualProfessor(professorId, dia),
      ja_paga: pagas.has(p.id),
    }
  })

  return calcularFechamento(remuneradas)
}

export async function gerarContaPagar(
  professorId: number,
  de: string,
  ate: string,
  usuario: string,
): Promise<{ ok: boolean; erros?: string[]; id?: number; valor?: Centavos }> {
  const supabase = await clienteServidor()
  const fechamento = await previaFechamento(professorId, de, ate)

  if (fechamento.itens.length === 0) {
    return { ok: false, erros: ['Nenhuma presença confirmada e ainda não paga neste período.'] }
  }

  const { data: conta, error } = await supabase
    .from('contas_pagar_professor')
    .insert({
      professor_id: professorId,
      periodo_inicio: de,
      periodo_fim: ate,
      valor_total: paraNumeric(fechamento.valor_total),
    })
    .select('id')
    .single()

  if (error) return { ok: false, erros: [error.message] }

  const { error: erroItens } = await supabase.from('itens_conta_pagar_professor').insert(
    fechamento.itens.map((i) => ({
      conta_pagar_id: conta.id,
      presenca_id: i.presenca_id,
      aluno_id: i.aluno_id,
      turma_id: i.turma_id,
      data_aula: i.data_aula,
      valor_servico: paraNumeric(i.valor_servico),
      percentual_aplicado: i.percentual_aplicado,
      valor_professor: paraNumeric(i.valor_professor),
    })),
  )

  if (erroItens) {
    await supabase.from('contas_pagar_professor').delete().eq('id', conta.id)
    return { ok: false, erros: [erroItens.message] }
  }

  await supabase.from('logs_operacionais').insert({
    acao: 'gerar_conta_pagar',
    entidade: 'contas_pagar_professor',
    entidade_id: conta.id,
    usuario,
    detalhe: { professor_id: professorId, periodo: `${de} a ${ate}`, valor: fechamento.valor_total },
  })

  return { ok: true, id: conta.id, valor: fechamento.valor_total }
}

export async function listarContasPagar(filtros: { professorId?: number; status?: string } = {}) {
  const supabase = await clienteServidor()
  let consulta = supabase
    .from('contas_pagar_professor')
    .select('id, professor_id, periodo_inicio, periodo_fim, valor_total, status, data_pagamento, professor:professores!professor_id (id, nome)')

  if (filtros.professorId) consulta = consulta.eq('professor_id', filtros.professorId)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)

  const { data } = await consulta.order('periodo_inicio', { ascending: false })

  return ((data ?? []) as unknown as {
    id: number
    professor_id: number
    periodo_inicio: string
    periodo_fim: string
    valor_total: string
    status: string
    data_pagamento: string | null
    professor: { id: number; nome: string } | null
  }[]).map((c) => ({ ...c, valor_total: deNumeric(c.valor_total) }))
}

export async function darBaixaPagamento(
  contaId: number,
  data: string,
  contaOrigemId: number,
  usuario: string,
): Promise<void> {
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('contas_pagar_professor')
    .update({ status: 'Pago', data_pagamento: data, conta_id: contaOrigemId })
    .eq('id', contaId)

  if (error) throw new Error(error.message)

  await supabase.from('logs_operacionais').insert({
    acao: 'pagar_professor',
    entidade: 'contas_pagar_professor',
    entidade_id: contaId,
    usuario,
    detalhe: { data_pagamento: data, conta_id: contaOrigemId },
  })
}

/** Relatório detalhado do fechamento, para conferência do professor (§8.3). */
export async function relatorioFechamento(contaId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('itens_conta_pagar_professor')
    .select('id, data_aula, valor_servico, percentual_aplicado, valor_professor, aluno:alunos!aluno_id (nome), turma:turmas!turma_id (nome)')
    .eq('conta_pagar_id', contaId)
    .order('data_aula')

  return ((data ?? []) as unknown as {
    id: number
    data_aula: string
    valor_servico: string
    percentual_aplicado: string
    valor_professor: string
    aluno: { nome: string } | null
    turma: { nome: string } | null
  }[]).map((i) => ({
    ...i,
    valor_servico: deNumeric(i.valor_servico),
    valor_professor: deNumeric(i.valor_professor),
    percentual_aplicado: Number(i.percentual_aplicado),
  }))
}
