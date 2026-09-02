import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import { carregarVigencias } from './vigencias'
import { calcularFechamento, type PresencaRemunerada } from '@/dominio/pagamentos/fechamento'
import { saldoEStatusDaConta, validarBaixa, type Baixa } from '@/dominio/pagamentos/baixa'
import { podeCancelarContaPagar, type StatusContaPagar } from '@/dominio/cobrancas/cancelamento'
import { gerarRelatorioFechamento, type LinhaRelatorio } from '@/dominio/pagamentos/relatorio'

/**
 * Levanta as presenças confirmadas do professor até a data, com o valor do
 * serviço e o percentual VIGENTES NA DATA DE CADA AULA.
 *
 * P2 (Rodada 2): só existe "até". A data inicial deixou de ser necessária
 * porque P1 garante que presença já reservada por outro fechamento não entra
 * de novo — então o sistema pode simplesmente varrer tudo o que sobrou.
 */
export async function previaFechamento(professorId: number, ate: string) {
  const supabase = await clienteServidor()

  const { data: presencas } = await supabase
    .from('presencas')
    .select(`
      id, presente, flag_reposicao, aluno_id, conta_pagar_id,
      aluno:alunos!aluno_id (nome),
      aula:aulas!aula_id (
        id, data_hora_inicio, turma_id,
        turma:turmas!turma_id (id, nome, servico_id, professor_id)
      )
    `)
    .eq('presente', true)
    // P1: presença já reservada por um fechamento não volta, mesmo que aquele
    // fechamento ainda esteja Pendente.
    .is('conta_pagar_id', null)

  const linhas = ((presencas ?? []) as unknown as {
    id: number
    presente: boolean
    flag_reposicao: boolean
    aluno_id: number
    conta_pagar_id: number | null
    aluno: { nome: string } | null
    aula: {
      id: number
      data_hora_inicio: string
      turma_id: number
      turma: { id: number; nome: string; servico_id: number; professor_id: number } | null
    } | null
  }[]).filter((p) => {
    const dia = p.aula?.data_hora_inicio.slice(0, 10) ?? ''
    return p.aula?.turma?.professor_id === professorId && dia !== '' && dia <= ate
  })

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
      ja_paga: false,
    }
  })

  return calcularFechamento(remuneradas)
}

export async function gerarContaPagar(
  professorId: number,
  ate: string,
  usuario: string,
): Promise<{ ok: boolean; erros?: string[]; id?: number; valor?: Centavos }> {
  const supabase = await clienteServidor()
  const fechamento = await previaFechamento(professorId, ate)

  if (fechamento.itens.length === 0) {
    return { ok: false, erros: ['Nenhuma presença confirmada e ainda não paga até esta data.'] }
  }

  // O periodo_inicio deixa de ser escolhido pela gestora (P2), mas continua
  // gravado: e o que o relatorio e o historico usam para dizer o que a conta
  // cobriu. Vem da aula mais antiga que entrou.
  const primeiraAula = fechamento.itens[0].data_aula

  const { data: conta, error } = await supabase
    .from('contas_pagar_professor')
    .insert({
      professor_id: professorId,
      periodo_inicio: primeiraAula,
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

  // P1: reserva as presenças IMEDIATAMENTE, sem esperar o pagamento. É isto que
  // impede a mesma presença de ser paga duas vezes quando a gestora fecha
  // períodos que se sobrepõem.
  const { error: erroReserva } = await supabase
    .from('presencas')
    .update({ conta_pagar_id: conta.id })
    .in('id', fechamento.itens.map((i) => i.presenca_id))

  if (erroReserva) {
    // Sem a reserva a conta não pode existir: ela pagaria de novo no próximo
    // fechamento. Desfaz tudo.
    await supabase.from('itens_conta_pagar_professor').delete().eq('conta_pagar_id', conta.id)
    await supabase.from('contas_pagar_professor').delete().eq('id', conta.id)
    return { ok: false, erros: [`Falha ao reservar as presenças: ${erroReserva.message}`] }
  }

  await supabase.from('logs_operacionais').insert({
    acao: 'gerar_conta_pagar',
    entidade: 'contas_pagar_professor',
    entidade_id: conta.id,
    usuario,
    detalhe: {
      professor_id: professorId,
      ate,
      presencas: fechamento.itens.length,
      valor: fechamento.valor_total,
    },
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

export interface EntradaBaixa extends Baixa {
  data: string
  forma_pagamento: string | null
  observacao: string | null
}

/**
 * P3 e P4 (Rodada 2): dá baixa numa conta a pagar, com suporte a valor parcial
 * e a pagamento feito fora da conta da empresa.
 *
 * Cada baixa é uma linha própria, como os recebimentos do lado das cobranças —
 * um `update` no status perderia o histórico de quem pagou o quê e quando, que
 * é justamente o que P4 quer poder relatar depois.
 */
export async function registrarBaixa(
  contaId: number,
  entrada: EntradaBaixa,
  usuario: string,
): Promise<{ ok: boolean; erros?: string[] }> {
  const supabase = await clienteServidor()

  const [{ data: conta }, { data: baixas }] = await Promise.all([
    supabase
      .from('contas_pagar_professor')
      .select('id, valor_total, status')
      .eq('id', contaId)
      .maybeSingle(),
    supabase.from('baixas_conta_pagar').select('valor').eq('conta_pagar_id', contaId),
  ])

  if (!conta) return { ok: false, erros: ['Conta a pagar não encontrada.'] }
  if (conta.status === 'Cancelada') {
    return { ok: false, erros: ['Esta conta foi cancelada e não recebe pagamento.'] }
  }

  const total = deNumeric(conta.valor_total)
  const jaPago = (baixas ?? []).reduce((s, b) => s + deNumeric(b.valor), 0)

  const erros = validarBaixa(entrada, total - jaPago)
  if (erros.length > 0) return { ok: false, erros }

  const { error } = await supabase.from('baixas_conta_pagar').insert({
    conta_pagar_id: contaId,
    valor: paraNumeric(entrada.valor),
    data: entrada.data,
    origem: entrada.origem,
    conta_id: entrada.conta_id,
    responsavel_id: entrada.responsavel_id,
    forma_pagamento: entrada.forma_pagamento,
    observacao: entrada.observacao,
    registrado_por: usuario,
  })

  if (error) return { ok: false, erros: [error.message] }

  const { saldo, status } = saldoEStatusDaConta(
    total,
    [...(baixas ?? []).map((b) => deNumeric(b.valor)), entrada.valor],
    conta.status as StatusContaPagar,
  )

  await supabase
    .from('contas_pagar_professor')
    .update({
      status,
      // A data de pagamento só faz sentido quando a conta fecha.
      data_pagamento: saldo === 0 ? entrada.data : null,
      conta_id: entrada.origem === 'Conta própria' ? entrada.conta_id : null,
    })
    .eq('id', contaId)

  await supabase.from('logs_operacionais').insert({
    acao: 'pagar_professor',
    entidade: 'contas_pagar_professor',
    entidade_id: contaId,
    usuario,
    detalhe: {
      valor: entrada.valor,
      data: entrada.data,
      origem: entrada.origem,
      conta_id: entrada.conta_id,
      responsavel_id: entrada.responsavel_id,
      status_resultante: status,
    },
  })

  return { ok: true }
}

/** As baixas já lançadas numa conta a pagar. */
export async function baixasDaConta(contaId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('baixas_conta_pagar')
    .select('id, valor, data, origem, forma_pagamento, observacao, conta:contas!conta_id (nome), responsavel:responsaveis!responsavel_id (nome)')
    .eq('conta_pagar_id', contaId)
    .order('data')

  return ((data ?? []) as unknown as {
    id: number
    valor: string
    data: string
    origem: string
    forma_pagamento: string | null
    observacao: string | null
    conta: { nome: string } | null
    responsavel: { nome: string } | null
  }[]).map((b) => ({ ...b, valor: deNumeric(b.valor) }))
}

/**
 * P5 (Rodada 2): cancela uma conta a pagar pendente.
 *
 * O que importa aqui é soltar as presenças: enquanto elas apontarem para esta
 * conta, ficam reservadas (P1) e nunca mais entrariam num fechamento — o
 * professor deixaria de receber por aulas que deu.
 */
export async function cancelarContaPagar(
  contaId: number,
  usuario: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = await clienteServidor()

  const [{ data: conta }, { count: baixas }] = await Promise.all([
    supabase
      .from('contas_pagar_professor')
      .select('id, status')
      .eq('id', contaId)
      .maybeSingle(),
    supabase
      .from('baixas_conta_pagar')
      .select('*', { count: 'exact', head: true })
      .eq('conta_pagar_id', contaId),
  ])

  if (!conta) return { ok: false, motivo: 'Conta a pagar não encontrada.' }

  const permissao = podeCancelarContaPagar(conta.status as StatusContaPagar, baixas ?? 0)
  if (!permissao.pode) return { ok: false, motivo: permissao.motivo }

  const { count: liberadas } = await supabase
    .from('presencas')
    .select('*', { count: 'exact', head: true })
    .eq('conta_pagar_id', contaId)

  const { error: erroSoltar } = await supabase
    .from('presencas')
    .update({ conta_pagar_id: null })
    .eq('conta_pagar_id', contaId)

  if (erroSoltar) {
    return { ok: false, motivo: `Falha ao liberar as presenças: ${erroSoltar.message}` }
  }

  // Os itens TÊM de sair junto. `itens_conta_pagar_professor.presenca_id` é
  // UNIQUE — é o que impede pagar a mesma presença duas vezes —, então um item
  // sobrevivente barraria para sempre a presença que acabou de ser liberada, e
  // o professor nunca receberia por aquela aula. Soltar a presença sem apagar o
  // item libera pela metade, que é pior do que não liberar.
  const { error: erroItens } = await supabase
    .from('itens_conta_pagar_professor')
    .delete()
    .eq('conta_pagar_id', contaId)

  if (erroItens) {
    return { ok: false, motivo: `Falha ao liberar o fechamento: ${erroItens.message}` }
  }

  // O valor total fica: é o registro de quanto esta conta chegou a somar.
  const { error } = await supabase
    .from('contas_pagar_professor')
    .update({ status: 'Cancelada' })
    .eq('id', contaId)

  if (error) return { ok: false, motivo: error.message }

  await supabase.from('logs_operacionais').insert({
    acao: 'cancelar_conta_pagar',
    entidade: 'contas_pagar_professor',
    entidade_id: contaId,
    usuario,
    detalhe: { presencas_liberadas: liberadas ?? 0 },
  })

  return { ok: true }
}

/**
 * Relatório detalhado do fechamento, para conferência do professor (§8.3).
 *
 * P6 (Rodada 2): o horário vem junto, para o agrupamento poder separar duas
 * turmas do mesmo professor no mesmo dia. Ele não está no item — que é um
 * retrato dos VALORES — então vem pela presença que originou o item.
 */
export async function relatorioFechamento(contaId: number): Promise<LinhaRelatorio[]> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('itens_conta_pagar_professor')
    .select('id, data_aula, valor_servico, percentual_aplicado, valor_professor, aluno:alunos!aluno_id (nome), turma:turmas!turma_id (nome), presenca:presencas!presenca_id (aula:aulas!aula_id (data_hora_inicio))')
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
    presenca: { aula: { data_hora_inicio: string } | null } | null
  }[]).map((i) => ({
    data_aula: String(i.data_aula).slice(0, 10),
    horario_inicio: i.presenca?.aula?.data_hora_inicio?.slice(11, 16) ?? '',
    turma_nome: i.turma?.nome ?? 'Turma',
    aluno_nome: i.aluno?.nome ?? 'Aluno',
    valor_servico: deNumeric(i.valor_servico),
    percentual_aplicado: Number(i.percentual_aplicado),
    valor_professor: deNumeric(i.valor_professor),
  }))
}

/** P6: o mesmo relatório em texto, pronto para o WhatsApp. */
export async function textoDoFechamento(contaId: number): Promise<string | null> {
  const supabase = await clienteServidor()
  const { data: conta } = await supabase
    .from('contas_pagar_professor')
    .select('periodo_fim, professor:professores!professor_id (nome)')
    .eq('id', contaId)
    .maybeSingle()

  if (!conta) return null

  const professor = conta.professor as unknown as { nome: string } | null

  return gerarRelatorioFechamento({
    professor_nome: professor?.nome ?? 'Professor',
    ate: String(conta.periodo_fim).slice(0, 10),
    linhas: await relatorioFechamento(contaId),
  })
}

/** Uma conta a pagar com tudo que a tela dela precisa. */
export async function obterContaPagar(contaId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('contas_pagar_professor')
    .select('id, professor_id, periodo_inicio, periodo_fim, valor_total, status, data_pagamento, professor:professores!professor_id (id, nome, telefone)')
    .eq('id', contaId)
    .maybeSingle()

  if (!data) return null

  const professor = data.professor as unknown as
    | { id: number; nome: string; telefone: string | null }
    | null

  return {
    id: data.id,
    professor_id: data.professor_id,
    professor_nome: professor?.nome ?? 'Professor',
    professor_telefone: professor?.telefone ?? null,
    periodo_inicio: String(data.periodo_inicio).slice(0, 10),
    periodo_fim: String(data.periodo_fim).slice(0, 10),
    valor_total: deNumeric(data.valor_total),
    status: data.status as StatusContaPagar,
    data_pagamento: data.data_pagamento ? String(data.data_pagamento).slice(0, 10) : null,
  }
}
