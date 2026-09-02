import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, formatarBRL, paraNumeric, somar, type Centavos } from '@/dominio/dinheiro'
import { carregarVigencias } from './vigencias'
import { podeCancelarCobranca, type StatusCobranca } from '@/dominio/cobrancas/cancelamento'
import { montarCobrancas, type AulaFaturavel } from '@/dominio/cobrancas/geracao'
import { gerarTextoCobranca, type ItemDoTexto } from '@/dominio/cobrancas/texto'

export interface CobrancaResumo {
  id: number
  responsavel_id: number
  mes_referencia: string
  valor_bruto: Centavos
  valor_desconto: Centavos
  valor_total: Centavos
  status: string
  texto_whatsapp: string | null
  responsavel: { id: number; nome: string; telefone: string | null } | null
  recebido: Centavos
}

/** Primeiro e último dia do mês, em ISO. */
export function limitesDoMes(mes: string): { primeiro: string; ultimo: string } {
  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(ano, m, 0).getDate()
  return { primeiro: `${mes}-01`, ultimo: `${mes}-${String(ultimoDia).padStart(2, '0')}` }
}

/**
 * Levanta as aulas do mês com tudo que a regra de faturamento precisa decidir.
 * O valor vem de `valor_servico_em`, resolvido para a data de cada aula — nunca
 * do valor corrente do serviço, que pode ter mudado desde então.
 */
async function aulasDoMes(mes: string): Promise<AulaFaturavel[]> {
  const supabase = await clienteServidor()
  const { primeiro, ultimo } = limitesDoMes(mes)

  const { data: aulas, error } = await supabase
    .from('aulas')
    .select(`
      id, data_hora_inicio, status, turma_id,
      turma:turmas!turma_id (
        id, nome, servico_id,
        servico:servicos!servico_id (id, nome),
        materia:materias!materia_id (nome),
        ano_escolar:anos_escolares!ano_escolar_id (nome)
      )
    `)
    .gte('data_hora_inicio', `${primeiro}T00:00:00`)
    .lte('data_hora_inicio', `${ultimo}T23:59:59`)

  if (error) throw new Error(`Falha ao carregar aulas: ${error.message}`)

  const linhas = (aulas ?? []) as unknown as {
    id: number
    data_hora_inicio: string
    status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
    turma_id: number
    turma: {
      id: number
      nome: string
      servico_id: number
      servico: { id: number; nome: string } | null
      materia: { nome: string } | null
      ano_escolar: { nome: string } | null
    } | null
  }[]

  if (linhas.length === 0) return []

  const [{ data: matriculas }, { data: cobradas }] = await Promise.all([
    supabase
      .from('matriculas')
      .select('aluno_id, turma_id, status, flag_reposicao, data_inicio, data_fim, aluno:alunos!aluno_id (id, nome, responsavel_id, responsavel:responsaveis!responsavel_id (id, nome))'),
    supabase.from('itens_cobranca').select('aula_id'),
  ])

  const jaCobradas = new Set((cobradas ?? []).map((c) => c.aula_id))

  const mats = (matriculas ?? []) as unknown as {
    aluno_id: number
    turma_id: number
    status: string
    flag_reposicao: boolean
    data_inicio: string
    data_fim: string | null
    aluno: {
      id: number
      nome: string
      responsavel_id: number
      responsavel: { id: number; nome: string } | null
    } | null
  }[]

  // Uma consulta so, resolvida em memoria. Antes era uma chamada RPC por par
  // (servico, dia), em serie: dezenas de idas ao banco para fechar um mes.
  const vigencias = await carregarVigencias()

  const faturaveis: AulaFaturavel[] = []

  for (const aula of linhas) {
    const dia = aula.data_hora_inicio.slice(0, 10)
    const doTurma = mats.filter(
      (m) =>
        m.turma_id === aula.turma_id &&
        m.data_inicio <= dia &&
        (!m.data_fim || m.data_fim >= dia),
    )

    for (const m of doTurma) {
      if (!m.aluno?.responsavel) continue
      const partes = [
        aula.turma?.materia?.nome,
        aula.turma?.ano_escolar?.nome,
        aula.turma?.servico?.nome,
      ].filter(Boolean)

      faturaveis.push({
        aula_id: aula.id,
        aluno_id: m.aluno_id,
        aluno_nome: m.aluno.nome,
        responsavel_id: m.aluno.responsavel.id,
        responsavel_nome: m.aluno.responsavel.nome,
        data: dia,
        descricao: partes.join(' — '),
        valor: vigencias.valorServico(aula.turma?.servico_id ?? 0, dia),
        status_aula: aula.status,
        matricula_ativa: m.status === 'Ativa',
        matricula_reposicao: m.flag_reposicao,
        ja_cobrada: jaCobradas.has(aula.id),
      })
    }
  }

  return faturaveis
}

/**
 * Gera as cobranças do mês em Rascunho, para a gestora revisar.
 * Reprocessar o mesmo mês não duplica item: aulas já cobradas são ignoradas na
 * montagem, e `UNIQUE(itens_cobranca.aula_id)` fecha a porta no banco.
 */
export async function gerarCobrancasDoMes(
  mes: string,
): Promise<{ criadas: number; itens: number }> {
  const supabase = await clienteServidor()
  const montadas = montarCobrancas(await aulasDoMes(mes))
  const { primeiro } = limitesDoMes(mes)

  let criadas = 0
  let itens = 0

  for (const c of montadas) {
    // C1 (Rodada 2): passa a existir mais de uma cobranca por responsavel no
    // mesmo mes. Um rascunho aberto continua sendo reaproveitado; se as
    // anteriores ja foram confirmadas, as aulas novas (matricula feita no meio
    // do mes) viram uma cobranca COMPLEMENTAR, sem tocar no que ja foi enviado.
    const { data: doMes } = await supabase
      .from('cobrancas')
      .select('id, status')
      .eq('responsavel_id', c.responsavel_id)
      .eq('mes_referencia', primeiro)
      .order('id')

    const rascunho = (doMes ?? []).find((x) => x.status === 'Rascunho')
    const jaTeveOutra = (doMes ?? []).length > 0

    let cobrancaId = rascunho?.id
    if (!cobrancaId) {
      const { data, error } = await supabase
        .from('cobrancas')
        .insert({
          responsavel_id: c.responsavel_id,
          mes_referencia: primeiro,
          complementar: jaTeveOutra,
          valor_bruto: paraNumeric(c.valor_bruto),
          valor_desconto: paraNumeric(c.valor_desconto),
          valor_total: paraNumeric(c.valor_total),
        })
        .select('id')
        .single()
      if (error) throw new Error(`Falha ao criar cobrança: ${error.message}`)
      cobrancaId = data.id
      criadas++
    }

    const { error: erroItens } = await supabase.from('itens_cobranca').insert(
      c.itens.map((i) => ({
        cobranca_id: cobrancaId,
        aluno_id: i.aluno_id,
        aula_id: i.aula_id,
        descricao: i.descricao,
        valor_original: paraNumeric(i.valor_original),
        desconto: paraNumeric(i.desconto),
        valor_final: paraNumeric(i.valor_final),
      })),
    )
    if (erroItens) throw new Error(`Falha ao gravar itens: ${erroItens.message}`)
    itens += c.itens.length

    await recalcularTotais(cobrancaId)
  }

  return { criadas, itens }
}

/** Recalcula os totais a partir dos itens. Chamar após qualquer ajuste. */
export async function recalcularTotais(cobrancaId: number): Promise<void> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('itens_cobranca')
    .select('valor_original, desconto, valor_final')
    .eq('cobranca_id', cobrancaId)

  const bruto = somar(...(data ?? []).map((i) => deNumeric(i.valor_original)))
  const desconto = somar(...(data ?? []).map((i) => deNumeric(i.desconto)))

  await supabase
    .from('cobrancas')
    .update({
      valor_bruto: paraNumeric(bruto),
      valor_desconto: paraNumeric(desconto),
      valor_total: paraNumeric(bruto - desconto),
    })
    .eq('id', cobrancaId)
}

export async function listarCobrancas(filtros: { mes?: string; status?: string } = {}) {
  const supabase = await clienteServidor()
  let consulta = supabase
    .from('cobrancas')
    .select('id, responsavel_id, mes_referencia, valor_bruto, valor_desconto, valor_total, status, complementar, conta_recebimento_id, texto_whatsapp, responsavel:responsaveis!responsavel_id (id, nome, telefone)')

  if (filtros.mes) consulta = consulta.eq('mes_referencia', `${filtros.mes}-01`)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)

  const { data, error } = await consulta.order('mes_referencia', { ascending: false })
  if (error) throw new Error(`Falha ao listar cobranças: ${error.message}`)

  const linhas = (data ?? []) as unknown as {
    id: number
    responsavel_id: number
    mes_referencia: string
    valor_bruto: string
    valor_desconto: string
    valor_total: string
    status: string
    complementar: boolean
    conta_recebimento_id: number | null
    texto_whatsapp: string | null
    responsavel: { id: number; nome: string; telefone: string | null } | null
  }[]

  const { data: recebimentos } = await supabase.from('recebimentos').select('cobranca_id, valor_recebido')
  const recebidoPor = new Map<number, Centavos>()
  for (const r of recebimentos ?? []) {
    recebidoPor.set(r.cobranca_id, somar(recebidoPor.get(r.cobranca_id) ?? 0, deNumeric(r.valor_recebido)))
  }

  return linhas.map((c) => ({
    ...c,
    valor_bruto: deNumeric(c.valor_bruto),
    valor_desconto: deNumeric(c.valor_desconto),
    valor_total: deNumeric(c.valor_total),
    recebido: recebidoPor.get(c.id) ?? 0,
  })) as CobrancaResumo[]
}

export async function obterCobranca(id: number) {
  const supabase = await clienteServidor()
  const { data: cobranca } = await supabase
    .from('cobrancas')
    .select('id, responsavel_id, mes_referencia, valor_bruto, valor_desconto, valor_total, status, complementar, conta_recebimento_id, texto_whatsapp, responsavel:responsaveis!responsavel_id (id, nome, telefone)')
    .eq('id', id)
    .maybeSingle()

  if (!cobranca) return null

  const { data: itens } = await supabase
    .from('itens_cobranca')
    .select('id, aluno_id, aula_id, descricao, valor_original, desconto, valor_final, aluno:alunos!aluno_id (nome), aula:aulas!aula_id (data_hora_inicio)')
    .eq('cobranca_id', id)

  const c = cobranca as unknown as {
    id: number
    responsavel_id: number
    mes_referencia: string
    valor_bruto: string
    valor_desconto: string
    valor_total: string
    status: string
    complementar: boolean
    conta_recebimento_id: number | null
    texto_whatsapp: string | null
    responsavel: { id: number; nome: string; telefone: string | null } | null
  }

  return {
    ...c,
    valor_bruto: deNumeric(c.valor_bruto),
    valor_desconto: deNumeric(c.valor_desconto),
    valor_total: deNumeric(c.valor_total),
    itens: ((itens ?? []) as unknown as {
      id: number
      aluno_id: number
      aula_id: number
      descricao: string
      valor_original: string
      desconto: string
      valor_final: string
      aluno: { nome: string } | null
      aula: { data_hora_inicio: string } | null
    }[]).map((i) => ({
      ...i,
      valor_original: deNumeric(i.valor_original),
      desconto: deNumeric(i.desconto),
      valor_final: deNumeric(i.valor_final),
      data: i.aula?.data_hora_inicio.slice(0, 10) ?? '',
    })),
  }
}

export async function ajustarDesconto(itemId: number, desconto: Centavos): Promise<void> {
  const supabase = await clienteServidor()
  const { data: item } = await supabase
    .from('itens_cobranca')
    .select('cobranca_id, valor_original')
    .eq('id', itemId)
    .maybeSingle()

  if (!item) throw new Error('Item não encontrado.')

  const original = deNumeric(item.valor_original)
  if (desconto < 0 || desconto > original) {
    throw new Error('O desconto não pode ser negativo nem maior que o valor da aula.')
  }

  await supabase
    .from('itens_cobranca')
    .update({ desconto: paraNumeric(desconto), valor_final: paraNumeric(original - desconto) })
    .eq('id', itemId)

  await recalcularTotais(item.cobranca_id)
}

/** Confirma a cobrança e gera o texto do WhatsApp (Operacionais 6.3). */
export async function confirmarCobranca(id: number, usuario: string): Promise<void> {
  const supabase = await clienteServidor()
  const cobranca = await obterCobranca(id)
  if (!cobranca) throw new Error('Cobrança não encontrada.')

  // C5 (Rodada 2): a chave Pix vem da conta de recebimento escolhida nesta
  // cobranca. Antes vinha da "primeira conta ativa com chave" — se a gestora
  // cadastrasse uma segunda conta, o texto passava a mostrar a chave errada
  // sem ninguem perceber.
  const { data: conta } = cobranca.conta_recebimento_id
    ? await supabase
        .from('contas')
        .select('chave_pix')
        .eq('id', cobranca.conta_recebimento_id)
        .maybeSingle()
    : await supabase
        .from('contas')
        .select('chave_pix')
        .not('chave_pix', 'is', null)
        .eq('ativo', true)
        .order('padrao_recebimento', { ascending: false })
        .limit(1)
        .maybeSingle()

  const [ano, mes] = cobranca.mes_referencia.split('-')
  const itensTexto: ItemDoTexto[] = cobranca.itens.map((i) => ({
    aluno_nome: i.aluno?.nome ?? 'Aluno',
    contexto: i.descricao.split(' — ').slice(0, 2).join(' — '),
    descricao: i.descricao.split(' — ').slice(-1)[0],
    data: i.data,
    valor_final: i.valor_final,
  }))

  const texto = gerarTextoCobranca({
    responsavel_nome: cobranca.responsavel?.nome ?? '',
    mes_referencia: cobranca.mes_referencia,
    complementar: cobranca.complementar,
    valor_total: cobranca.valor_total,
    chave_pix: conta?.chave_pix ?? null,
    vencimento: `${ano}-${mes}-05`,
    itens: itensTexto,
  })

  await supabase
    .from('cobrancas')
    .update({ status: 'Confirmada', texto_whatsapp: texto })
    .eq('id', id)

  await supabase.from('logs_operacionais').insert({
    acao: 'confirmar_cobranca',
    entidade: 'cobrancas',
    entidade_id: id,
    usuario,
    detalhe: { valor_total: cobranca.valor_total, itens: cobranca.itens.length },
  })
}

export async function marcarComoEnviada(id: number): Promise<void> {
  const supabase = await clienteServidor()
  await supabase.from('cobrancas').update({ status: 'Enviada' }).eq('id', id)
}

/**
 * C3 (Rodada 2): aplica o mesmo desconto a todos os itens de um grupo.
 *
 * O desconto continua guardado item a item — o modelo nao muda. Isto e so o
 * atalho: quando o desconto foi negociado para todas as aulas de um servico,
 * repetir o valor linha a linha e trabalho sem sentido, e cada digitacao e uma
 * chance de errar uma delas.
 */
export async function aplicarDescontoEmLote(
  cobrancaId: number,
  /** Os itens que recebem o desconto — a tela decide o recorte (aluno, servico). */
  itemIds: number[],
  descontoPorItem: Centavos,
): Promise<{ ok: boolean; motivo?: string; aplicados?: number }> {
  const supabase = await clienteServidor()

  if (itemIds.length === 0) return { ok: true, aplicados: 0 }
  if (descontoPorItem < 0) return { ok: false, motivo: 'O desconto não pode ser negativo.' }

  const { data: itens } = await supabase
    .from('itens_cobranca')
    .select('id, valor_original')
    .eq('cobranca_id', cobrancaId)
    .in('id', itemIds)

  if (!itens || itens.length === 0) return { ok: false, motivo: 'Itens não encontrados.' }

  // Um desconto maior que a aula mais barata do grupo faria o valor final ficar
  // negativo. Avisa antes de gravar metade.
  const menor = Math.min(...itens.map((i) => deNumeric(i.valor_original)))
  if (descontoPorItem > menor) {
    return {
      ok: false,
      motivo: `O desconto não pode passar de ${formatarBRL(menor)}, que é o valor da aula mais barata do grupo.`,
    }
  }

  for (const item of itens) {
    const original = deNumeric(item.valor_original)
    await supabase
      .from('itens_cobranca')
      .update({
        desconto: paraNumeric(descontoPorItem),
        valor_final: paraNumeric(original - descontoPorItem),
      })
      .eq('id', item.id)
  }

  await recalcularTotais(cobrancaId)
  return { ok: true, aplicados: itens.length }
}

/**
 * C4 (Rodada 2): remove uma aula do rascunho antes de confirmar.
 *
 * A aula volta a ficar "nao cobrada", entao pode entrar numa geracao futura — e
 * o comportamento certo para o caso do item: a gestora ja sabe que aquela aula
 * nao vai acontecer, mas se acontecer depois ainda tem de ser cobrada.
 */
export async function excluirItem(itemId: number): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = await clienteServidor()

  const { data: item } = await supabase
    .from('itens_cobranca')
    .select('cobranca_id, cobranca:cobrancas!cobranca_id (status)')
    .eq('id', itemId)
    .maybeSingle()

  if (!item) return { ok: false, motivo: 'Este item não existe mais.' }

  const cobranca = item.cobranca as unknown as { status: string } | null
  if (cobranca?.status !== 'Rascunho') {
    return { ok: false, motivo: 'Só dá para excluir itens enquanto a cobrança é um rascunho.' }
  }

  const { error } = await supabase.from('itens_cobranca').delete().eq('id', itemId)
  if (error) return { ok: false, motivo: error.message }

  await recalcularTotais(item.cobranca_id)
  return { ok: true }
}

/** C5: as contas que podem receber, com a padrao primeiro. */
export async function contasDeRecebimento() {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('contas')
    .select('id, nome, chave_pix, padrao_recebimento')
    .eq('ativo', true)
    .order('padrao_recebimento', { ascending: false })
    .order('nome')

  return data ?? []
}

/**
 * C5 (Rodada 2): define qual chave Pix aparece no texto da cobranca.
 *
 * Editavel so no rascunho, como o documento pede: depois de confirmada, o
 * responsavel ja pode ter recebido o texto com a outra chave, e mudar aqui
 * criaria divergencia entre o que ele viu e o que o sistema mostra.
 */
export async function definirContaDeRecebimento(
  cobrancaId: number,
  contaId: number | null,
): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = await clienteServidor()

  const { data: cobranca } = await supabase
    .from('cobrancas')
    .select('status')
    .eq('id', cobrancaId)
    .maybeSingle()

  if (!cobranca) return { ok: false, motivo: 'Cobrança não encontrada.' }
  if (cobranca.status !== 'Rascunho') {
    return { ok: false, motivo: 'A conta de recebimento só pode ser trocada no rascunho.' }
  }

  const { error } = await supabase
    .from('cobrancas')
    .update({ conta_recebimento_id: contaId })
    .eq('id', cobrancaId)

  if (error) return { ok: false, motivo: error.message }
  return { ok: true }
}

/**
 * C7 (Rodada 2): cancela uma cobranca confirmada ou enviada.
 *
 * O ponto do item nao e o status: e liberar as aulas. Enquanto os itens
 * existirem, aquelas aulas contam como ja cobradas e nunca mais entrariam numa
 * geracao — a cobranca cancelada deixaria um buraco permanente no faturamento.
 */
export async function cancelarCobranca(
  cobrancaId: number,
  usuario: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = await clienteServidor()

  const [{ data: cobranca }, { count: recebimentos }] = await Promise.all([
    supabase.from('cobrancas').select('id, status').eq('id', cobrancaId).maybeSingle(),
    supabase
      .from('recebimentos')
      .select('*', { count: 'exact', head: true })
      .eq('cobranca_id', cobrancaId),
  ])

  if (!cobranca) return { ok: false, motivo: 'Cobrança não encontrada.' }

  const permissao = podeCancelarCobranca(cobranca.status as StatusCobranca, recebimentos ?? 0)
  if (!permissao.pode) return { ok: false, motivo: permissao.motivo }

  const { data: itens } = await supabase
    .from('itens_cobranca')
    .select('id')
    .eq('cobranca_id', cobrancaId)

  // Apagar os itens e o que solta as aulas: `UNIQUE(aula_id, aluno_id)` e a
  // marca de "ja cobrada", entao sem item nao ha marca.
  const { error: erroItens } = await supabase
    .from('itens_cobranca')
    .delete()
    .eq('cobranca_id', cobrancaId)
  if (erroItens) return { ok: false, motivo: `Falha ao liberar as aulas: ${erroItens.message}` }

  const { error } = await supabase
    .from('cobrancas')
    .update({ status: 'Cancelada', valor_bruto: 0, valor_desconto: 0, valor_total: 0 })
    .eq('id', cobrancaId)

  if (error) return { ok: false, motivo: error.message }

  await supabase.from('logs_operacionais').insert({
    acao: 'cancelar_cobranca',
    entidade: 'cobrancas',
    entidade_id: cobrancaId,
    usuario,
    detalhe: { aulas_liberadas: (itens ?? []).length },
  })

  return { ok: true }
}
