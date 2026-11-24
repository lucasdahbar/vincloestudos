import 'server-only'
import { clienteServidor } from './cliente'
import { lerTudo, refazerTextoDaCobranca } from './cobrancas'
import { carregarVigencias } from './vigencias'
import { aulasParaVarredura } from './varredura'
import { varrer } from '@/dominio/agenda/varredura'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import type { StatusCobranca } from '@/dominio/cobrancas/cancelamento'
import {
  acertoDaTroca,
  devidoNaAula,
  resumoDaTroca,
  trocarServicoNaDescricao,
  type ItemNaTroca,
  type LinhaDoResumo,
} from '@/dominio/cobrancas/troca-de-servico'

/**
 * Troca de servico em aula ja cobrada (Julio, 24/11/2026). A regra mora em
 * `dominio/cobrancas/troca-de-servico.ts`; aqui, o levantamento (o mesmo para
 * a previa e para a gravacao, para a Kelly ver exatamente o que vai acontecer)
 * e a aplicacao.
 */

export interface TrocaDaAula {
  aula_id: number
  servico_antes: number
  servico_depois: number
}

interface LinhaDaTroca extends ItemNaTroca {
  item_id: number
  cobranca_id: number
  aula_id: number
  aluno_id: number
  aluno_nome: string
  responsavel_id: number
  responsavel_nome: string
  data: string
  descricao: string
  servico_antes: number
  servico_depois: number
  nome_antes: string
  nome_depois: string
}

const dia = (v: unknown) => String(v).slice(0, 10)
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Os itens de cobranca das aulas que trocam de servico. So o item da aula (nao
 * o de uma diferenca anterior), de cobranca ja mandada ou paga: rascunho e
 * refeito na geracao. A aula que ja virou credito (aluno saiu, "nao cobrar")
 * fica de fora: o dinheiro dela ja foi acertado.
 */
async function levantar(trocas: TrocaDaAula[]): Promise<LinhaDaTroca[]> {
  const mudam = trocas.filter((t) => t.servico_antes !== t.servico_depois)
  if (mudam.length === 0) return []
  const supabase = await clienteServidor()
  const ids = mudam.map((t) => t.aula_id)
  const porAula = new Map(mudam.map((t) => [t.aula_id, t]))

  const [itens, reposicoes, servicos] = await Promise.all([
    lerTudo((a, b) =>
      supabase
        .from('itens_cobranca')
        .select(
          'id, aula_id, aluno_id, descricao, valor_original, cobranca:cobrancas!inner (id, status, responsavel_id, recebimentos (id)), aluno:alunos!aluno_id (nome, responsavel:responsaveis!responsavel_id (nome)), aula:aulas!aula_id (data_hora_referencia), creditos (id)',
        )
        .in('aula_id', ids)
        .is('diferenca_id', null)
        .not('cobranca.status', 'in', '(Rascunho,Cancelada)')
        .order('id')
        .range(a, b),
    ),
    lerTudo((a, b) =>
      supabase
        .from('pendencias_reposicao')
        .select('aluno_id, aula_reposicao_id, aula_origem:aulas!aula_origem_id (data_hora_referencia, servico_id)')
        .in('aula_reposicao_id', ids)
        .neq('status', 'Desistida')
        .order('id')
        .range(a, b),
    ),
    supabase.from('servicos').select('id, nome'),
  ])
  if (servicos.error) throw new Error(`Falha ao ler os serviços: ${servicos.error.message}`)

  // A aula que o aluno perdeu e virou credito (aviso, falta ou exclusao).
  const { data: creditadas, error } = await supabase
    .from('creditos')
    .select('aluno_id, pendencia:pendencias_reposicao!pendencia_id!inner (aula_origem_id)')
    .in('pendencia.aula_origem_id', ids)
  if (error) throw new Error(`Falha ao ler os créditos: ${error.message}`)
  const jaCreditada = new Set(
    (creditadas ?? []).map((c) => `${(c.pendencia as unknown as { aula_origem_id: number }).aula_origem_id}:${c.aluno_id}`),
  )

  const nomes = new Map((servicos.data ?? []).map((s) => [s.id as number, s.nome as string]))
  const vigencias = await carregarVigencias()
  const origem = new Map(
    (reposicoes as unknown as { aluno_id: number; aula_reposicao_id: number; aula_origem: { data_hora_referencia: string; servico_id: number } | null }[])
      .filter((p) => p.aula_origem)
      .map((p) => [
        `${p.aula_reposicao_id}:${p.aluno_id}`,
        vigencias.valorServico(p.aula_origem!.servico_id, dia(p.aula_origem!.data_hora_referencia)),
      ]),
  )

  const linhas: LinhaDaTroca[] = []
  for (const i of itens as unknown as {
    id: number
    aula_id: number
    aluno_id: number
    descricao: string
    valor_original: string
    cobranca: { id: number; status: StatusCobranca; responsavel_id: number; recebimentos: { id: number }[] | null }
    aluno: { nome: string; responsavel: { nome: string } | null } | null
    aula: { data_hora_referencia: string }
    creditos: { id: number }[] | null
  }[]) {
    const k = `${i.aula_id}:${i.aluno_id}`
    if ((i.creditos ?? []).length > 0 || jaCreditada.has(k)) continue
    const t = porAula.get(i.aula_id)!
    const data = dia(i.aula.data_hora_referencia)
    const original = origem.get(k) ?? null
    linhas.push({
      item_id: i.id,
      cobranca_id: i.cobranca.id,
      aula_id: i.aula_id,
      aluno_id: i.aluno_id,
      aluno_nome: i.aluno?.nome ?? 'Aluno',
      responsavel_id: i.cobranca.responsavel_id,
      responsavel_nome: i.aluno?.responsavel?.nome ?? 'Responsável',
      data,
      descricao: i.descricao,
      servico_antes: t.servico_antes,
      servico_depois: t.servico_depois,
      nome_antes: nomes.get(t.servico_antes) ?? '',
      nome_depois: nomes.get(t.servico_depois) ?? '',
      status: i.cobranca.status,
      temRecebimento: (i.cobranca.recebimentos ?? []).length > 0,
      valor_original: deNumeric(i.valor_original),
      antes: devidoNaAula(vigencias.valorServico(t.servico_antes, data), original),
      depois: devidoNaAula(vigencias.valorServico(t.servico_depois, data), original),
    })
  }
  return linhas
}

/**
 * As aulas que a mudanca de servico pegaria, pela mesma varredura da
 * gravacao: fica de fora a aula no pagamento do professor. Na serie, como em
 * `planoDeDivisao`, so muda a aula que segue o servico da turma.
 */
export async function trocasDaMudanca(
  turmaId: number,
  pedido: { escopo: 'esta'; aulaId: number } | { escopo: 'a-partir' | 'serie'; aPartirDe: string },
  servicoNovo: number,
): Promise<TrocaDaAula[]> {
  const supabase = await clienteServidor()
  const fatos = await aulasParaVarredura(
    turmaId,
    pedido.escopo,
    pedido.escopo === 'esta' ? { aulaId: pedido.aulaId } : { aPartirDe: pedido.aPartirDe },
  )
  const livres = varrer(fatos, { tipo: 'editar', servico: true }, pedido.escopo)
    .aulas.filter((a) => a.campos?.servico)
    .map((a) => a.id)
  if (livres.length === 0) return []

  const { data: turma, error: erroTurma } = await supabase.from('turmas').select('servico_id').eq('id', turmaId).maybeSingle()
  if (erroTurma) throw new Error(`Falha ao ler a turma: ${erroTurma.message}`)
  const aulas: { id: number; servico_id: number }[] = []
  for (let i = 0; i < livres.length; i += 200) {
    const { data, error } = await supabase.from('aulas').select('id, servico_id').in('id', livres.slice(i, i + 200))
    if (error) throw new Error(`Falha ao ler as aulas: ${error.message}`)
    aulas.push(...(data ?? []))
  }
  return aulas
    .filter((a) => pedido.escopo === 'esta' || a.servico_id === turma?.servico_id)
    .map((a) => ({ aula_id: a.id, servico_antes: a.servico_id, servico_depois: servicoNovo }))
}

/** Para a previa: o que a troca faria em cada familia, se a Kelly aplicar a diferenca. */
export async function previaDaTroca(trocas: TrocaDaAula[]): Promise<LinhaDoResumo[]> {
  const linhas = await levantar(trocas)
  return resumoDaTroca(linhas.map((l) => ({ ...l, acerto: acertoDaTroca(l, true) })))
}

export interface ResultadoDaTroca {
  ok: boolean
  complementar: Centavos
  credito: Centavos
  ajustadas: number
  dispensadas: number
  /** Cobrancas ja mandadas que mudaram de valor e precisam ser reenviadas. */
  reenviar: number
  erros: string[]
}

/**
 * Chamar DEPOIS de gravar o servico novo nas aulas, com o levantamento feito
 * ANTES (`levantarTroca`): depois da gravacao nao da mais para saber o
 * servico antigo. Cada item e independente: uma falha nao desfaz os outros, e
 * a mensagem diz qual ficou.
 */
export async function aplicarTroca(
  linhas: LinhaDaTroca[],
  aplicarDiferenca: boolean,
  usuario: string,
): Promise<ResultadoDaTroca> {
  const supabase = await clienteServidor()
  const r: ResultadoDaTroca = { ok: true, complementar: 0, credito: 0, ajustadas: 0, dispensadas: 0, reenviar: 0, erros: [] }
  const refazer = new Set<number>()
  const reenviar = new Set<number>()
  const falha = (l: LinhaDaTroca, motivo: string) => {
    r.ok = false
    r.erros.push(`${l.aluno_nome}, aula de ${ddmm(l.data)}: ${motivo}`)
  }

  for (const l of linhas) {
    let acerto = acertoDaTroca(l, aplicarDiferenca)

    if (acerto.tipo === 'ajustar') {
      const { data: ficou, error } = await supabase.rpc('ajustar_item_pela_troca_de_servico', {
        p_item_id: l.item_id,
        p_valor_original: paraNumeric(acerto.valor_original),
        p_descricao: trocarServicoNaDescricao(l.descricao, l.nome_antes, l.nome_depois),
      })
      if (error) {
        falha(l, `o valor não foi corrigido na cobrança (${error.message})`)
        continue
      }
      if (ficou) {
        r.ajustadas++
        refazer.add(l.cobranca_id)
        if (l.status === 'Enviada') reenviar.add(l.cobranca_id)
        continue
      }
      // Entrou um pagamento no meio: segue como cobranca paga.
      acerto = acertoDaTroca({ ...l, temRecebimento: true }, aplicarDiferenca)
    }

    if (acerto.tipo === 'nada' || acerto.tipo === 'ajustar') continue

    const diferenca = {
      aula_id: l.aula_id,
      aluno_id: l.aluno_id,
      responsavel_id: l.responsavel_id,
      servico_antes: l.servico_antes,
      servico_depois: l.servico_depois,
      registrado_por: usuario,
    }

    if (acerto.tipo === 'complementar' || acerto.tipo === 'dispensada') {
      const { error } = await supabase.from('diferencas_servico').insert({
        ...diferenca,
        valor: paraNumeric(acerto.valor),
        destino: acerto.tipo === 'complementar' ? 'Complementar' : 'Dispensada',
      })
      if (error) {
        falha(l, `a diferença não foi registrada (${error.message})`)
        continue
      }
      if (acerto.tipo === 'complementar') r.complementar += acerto.valor
      else r.dispensadas++
      continue
    }

    // Credito: primeiro o credito, depois a diferenca que aponta para ele.
    const { data: credito, error: erroCredito } = await supabase
      .from('creditos')
      .insert({
        responsavel_id: l.responsavel_id,
        aluno_id: l.aluno_id,
        valor: paraNumeric(acerto.valor),
        descricao: `A aula de ${ddmm(l.data)} de ${l.aluno_nome} passou de ${l.nome_antes} para ${l.nome_depois}, que custa menos, e já tinha sido paga.`,
      })
      .select('id')
      .single()
    if (erroCredito) {
      falha(l, `o crédito não foi criado (${erroCredito.message})`)
      continue
    }
    const { error: erroDiferenca } = await supabase.from('diferencas_servico').insert({
      ...diferenca,
      valor: paraNumeric(-acerto.valor),
      destino: 'Crédito',
      credito_id: credito.id,
    })
    if (erroDiferenca) {
      // Sem o registro, o pagamento do professor nao saberia do credito.
      await supabase.from('creditos').delete().eq('id', credito.id)
      falha(l, `o crédito não foi criado (${erroDiferenca.message})`)
      continue
    }
    r.credito += acerto.valor
  }

  for (const id of refazer) {
    const t = await refazerTextoDaCobranca(id)
    if (!t.ok) {
      r.ok = false
      r.erros.push(`O valor da cobrança mudou, mas o texto do WhatsApp não foi refeito: ${t.motivo}`)
    }
  }
  r.reenviar = reenviar.size

  if (linhas.length > 0) {
    await supabase.from('logs_operacionais').insert({
      acao: 'troca_de_servico_cobrada',
      entidade: 'aulas',
      entidade_id: linhas[0].aula_id,
      usuario,
      detalhe: {
        aulas: [...new Set(linhas.map((l) => l.aula_id))],
        aplicar_diferenca: aplicarDiferenca,
        complementar: r.complementar,
        credito: r.credito,
        ajustadas: r.ajustadas,
        dispensadas: r.dispensadas,
      },
    })
  }
  return r
}

/**
 * Quanto a troca de servico ja mexeu no que a familia pagou por cada aula do
 * aluno: o credito ja dado (aula que ficou mais barata) e a complementar ja
 * paga (mais cara). Quem devolve a aula inteira em credito ("nao cobrar",
 * saida da turma) usa isto para devolver o que foi pago, nem mais nem menos.
 */
export async function acertosDaTroca(
  alunoId: number,
  aulaIds: number[],
): Promise<Map<number, { devolvido: Centavos; complementarPaga: Centavos }>> {
  const mapa = new Map<number, { devolvido: Centavos; complementarPaga: Centavos }>()
  if (aulaIds.length === 0) return mapa
  const supabase = await clienteServidor()
  const { data, error } = await supabase
    .from('diferencas_servico')
    .select('aula_id, valor, destino, itens:itens_cobranca!diferenca_id (valor_final, cobranca:cobrancas!cobranca_id (recebimentos (id)))')
    .eq('aluno_id', alunoId)
    .in('aula_id', aulaIds)
    .in('destino', ['Complementar', 'Crédito'])
  if (error) throw new Error(`Falha ao ler as trocas de serviço: ${error.message}`)

  for (const d of (data ?? []) as unknown as {
    aula_id: number
    valor: string
    destino: 'Complementar' | 'Crédito'
    itens: { valor_final: string; cobranca: { recebimentos: { id: number }[] | null } | null }[] | null
  }[]) {
    const atual = mapa.get(d.aula_id) ?? { devolvido: 0, complementarPaga: 0 }
    if (d.destino === 'Crédito') atual.devolvido += -deNumeric(d.valor)
    else {
      for (const i of d.itens ?? []) {
        if ((i.cobranca?.recebimentos ?? []).length > 0) atual.complementarPaga += deNumeric(i.valor_final)
      }
    }
    mapa.set(d.aula_id, atual)
  }
  return mapa
}

export { levantar as levantarTroca }
export type { LinhaDaTroca }
