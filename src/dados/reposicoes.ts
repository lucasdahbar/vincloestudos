import 'server-only'
import type { OrigemAusencia } from '@/dominio/tipos'
import { clienteServidor } from './cliente'
import { planejarReposicao, validarDesistencia, type Pendencia } from '@/dominio/reposicoes/agendamento'
import {
  creditoDaDesistencia,
  podeCancelarAviso,
  validarDecisao,
  type Decisao,
  type StatusCobranca,
} from '@/dominio/reposicoes/desfecho'
import { deNumeric, paraNumeric } from '@/dominio/dinheiro'

export interface PendenciaComRelacoes {
  id: number
  aluno_id: number
  aula_origem_id: number
  status: 'Pendente' | 'Agendada' | 'Realizada' | 'Desistida'
  origem: OrigemAusencia
  cobrar: boolean | null
  pagar_professor: boolean | null
  aula_reposicao_id: number | null
  aluno: { id: number; nome: string } | null
  aula_origem: {
    id: number
    data_hora_inicio: string
    turma_id: number
    turma: { id: number; nome: string } | null
  } | null
}

const SELECT = `
  id, aluno_id, aula_origem_id, status, origem, cobrar, pagar_professor, aula_reposicao_id,
  aluno:alunos!aluno_id (id, nome),
  aula_origem:aulas!aula_origem_id (
    id, data_hora_inicio, turma_id, turma:turmas!turma_id (id, nome)
  )
`

export async function listarPendencias(filtros: { status?: string; alunoId?: number } = {}) {
  const supabase = await clienteServidor()
  let consulta = supabase.from('pendencias_reposicao').select(SELECT)

  if (filtros.status) consulta = consulta.eq('status', filtros.status)
  if (filtros.alunoId) consulta = consulta.eq('aluno_id', filtros.alunoId)

  const { data, error } = await consulta.order('created_at', { ascending: false })
  if (error) throw new Error(`Falha ao listar reposições: ${error.message}`)
  return (data ?? []) as unknown as PendenciaComRelacoes[]
}

/** Aulas futuras agendadas, para a gestora escolher o destino da reposição. */
export async function aulasDisponiveis(de: string) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('aulas')
    .select('id, data_hora_inicio, turma_id, turma:turmas!turma_id (id, nome)')
    .eq('status', 'Agendada')
    .gte('data_hora_inicio', `${de}T00:00:00`)
    .order('data_hora_inicio')
    .limit(200)

  return (data ?? []) as unknown as {
    id: number
    data_hora_inicio: string
    turma_id: number
    turma: { id: number; nome: string } | null
  }[]
}

/**
 * Agenda a reposição. Quando é em turma diferente da original, cria a matrícula
 * de reposição — só para a data da aula escolhida.
 */
export async function agendarReposicao(
  pendenciaId: number,
  aulaDestinoId: number,
): Promise<{ ok: boolean; erros?: string[]; turmasAfetadas?: number[] }> {
  const supabase = await clienteServidor()

  const { data: p } = await supabase
    .from('pendencias_reposicao')
    .select(
      'id, aluno_id, aula_origem_id, status, matricula_reposicao_id, aula_origem:aulas!aula_origem_id (turma_id), matricula:matriculas!matricula_reposicao_id (turma_id)',
    )
    .eq('id', pendenciaId)
    .maybeSingle()

  if (!p) return { ok: false, erros: ['Pendência não encontrada.'] }

  const { data: destino } = await supabase
    .from('aulas')
    .select('id, turma_id, status, data_hora_inicio, data_hora_referencia')
    .eq('id', aulaDestinoId)
    .maybeSingle()

  if (!destino) return { ok: false, erros: ['Aula de destino não encontrada.'] }
  const diaDestino = String(destino.data_hora_referencia).slice(0, 10)

  const origem = p.aula_origem as unknown as { turma_id: number } | null

  const pendencia: Pendencia = {
    id: p.id,
    aluno_id: p.aluno_id,
    aula_origem_id: p.aula_origem_id,
    turma_origem_id: origem?.turma_id ?? 0,
    status: p.status,
  }

  // So as regulares: a matricula de reposicao de uma remarcacao (a antiga, que
  // sai logo abaixo) nao pode passar por "ja matriculado" na turma de destino.
  const { data: matriculas } = await supabase
    .from('matriculas')
    .select('aluno_id, turma_id')
    .eq('aluno_id', p.aluno_id)
    .eq('status', 'Ativa')
    .eq('flag_reposicao', false)

  const plano = planejarReposicao(pendencia, destino, matriculas ?? [])
  if (plano.erros.length > 0) return { ok: false, erros: plano.erros }

  // Remarcacao: a matricula da reposicao anterior valia so para aquela aula.
  // Sai antes da nova, para o aluno nao continuar na lista da aula antiga (e
  // para nao bater na trava de sobreposicao quando a data e a mesma).
  const anterior = p.matricula as unknown as { turma_id: number } | null
  if (p.matricula_reposicao_id) {
    await supabase
      .from('pendencias_reposicao')
      .update({ matricula_reposicao_id: null })
      .eq('id', pendenciaId)
    const { error } = await supabase.from('matriculas').delete().eq('id', p.matricula_reposicao_id)
    if (error) return { ok: false, erros: [error.message] }
  }

  let matriculaId: number | null = null
  if (plano.precisaMatricula && plano.matricula) {
    const { data, error } = await supabase
      .from('matriculas')
      // Rodada 3: só na data da aula de reposição ("apenas na data indicada").
      // Antes ia de hoje em diante, sem fim, e o aluno passava a aparecer em
      // todas as aulas seguintes daquela turma.
      .insert({ ...plano.matricula, data_inicio: diaDestino, data_fim: diaDestino })
      .select('id')
      .single()
    if (error) return { ok: false, erros: [error.message] }
    matriculaId = data.id
  }

  const { error } = await supabase
    .from('pendencias_reposicao')
    .update({
      status: 'Agendada',
      aula_reposicao_id: aulaDestinoId,
      matricula_reposicao_id: matriculaId,
    })
    .eq('id', pendenciaId)

  if (error) return { ok: false, erros: [error.message] }
  // As turmas cuja lista de alunos mudou, para atualizar o evento no Google.
  const turmasAfetadas = [...new Set([destino.turma_id, ...(anterior ? [anterior.turma_id] : [])])]
  return { ok: true, turmasAfetadas }
}

/**
 * O aluno desistiu da reposição. A gestora decide se cobra a aula perdida e,
 * cobrando, se paga o professor por ela (regra de 09/10/2026).
 */
export async function desistirReposicao(
  pendenciaId: number,
  decisao: Decisao,
): Promise<{ ok: boolean; erros?: string[]; turmasAfetadas?: number[] }> {
  const supabase = await clienteServidor()
  const { data: p } = await supabase
    .from('pendencias_reposicao')
    .select(
      'id, aluno_id, aula_origem_id, status, matricula_reposicao_id, matricula:matriculas!matricula_reposicao_id (turma_id)',
    )
    .eq('id', pendenciaId)
    .maybeSingle()

  if (!p) return { ok: false, erros: ['Pendência não encontrada.'] }

  const erros = [...validarDesistencia({ ...p, turma_origem_id: 0 }), ...validarDecisao(decisao)]
  if (p.status === 'Desistida') erros.push('A desistência já foi registrada.')
  if (erros.length > 0) return { ok: false, erros }

  const { error } = await supabase
    .from('pendencias_reposicao')
    .update({
      status: 'Desistida',
      cobrar: decisao.cobrar,
      pagar_professor: decisao.pagarProfessor,
      decidido_em: new Date().toISOString(),
    })
    .eq('id', pendenciaId)

  if (error) return { ok: false, erros: [error.message] }

  // Reposição que estava marcada: o aluno sai da aula de destino. A matrícula
  // de reposição existia só para aquela data.
  const destino = p.matricula as unknown as { turma_id: number } | null
  if (p.matricula_reposicao_id) {
    await supabase.from('matriculas').delete().eq('id', p.matricula_reposicao_id)
  }

  const r = await aplicarEfeitoFinanceiro(pendenciaId)
  return { ...r, turmasAfetadas: destino ? [destino.turma_id] : [] }
}

/**
 * A gestora registra que o aluno avisou que não vem a uma aula específica.
 *
 * "Não gerar reposição" é o mesmo que desistir na hora: a pendência já nasce
 * Desistida, com a decisão de cobrança. Um registro só para os dois caminhos
 * da regra, e o aviso continua visível na aula, para a gestora e o professor.
 */
export async function registrarAviso(
  alunoId: number,
  aulaOrigemId: number,
  decisao: { gerarReposicao: true } | ({ gerarReposicao: false } & Decisao),
): Promise<{ ok: boolean; erros?: string[]; turmasAfetadas?: number[] }> {
  if (!decisao.gerarReposicao) {
    const erros = validarDecisao(decisao)
    if (erros.length > 0) return { ok: false, erros }
  }

  const supabase = await clienteServidor()

  const [{ data: aula }, { data: pendenciaExistente }] = await Promise.all([
    supabase
      .from('aulas')
      .select('id, turma_id, status, data_hora_inicio, data_hora_referencia')
      .eq('id', aulaOrigemId)
      .maybeSingle(),
    supabase
      .from('pendencias_reposicao')
      .select('id, status')
      .eq('aluno_id', alunoId)
      .eq('aula_origem_id', aulaOrigemId)
      .maybeSingle(),
  ])

  if (!aula) return { ok: false, erros: ['Esta aula não existe mais.'] }
  if (aula.status === 'Cancelada') {
    return { ok: false, erros: ['Esta aula foi cancelada: não há reposição a fazer.'] }
  }
  if (aula.status === 'Excluída') {
    return { ok: false, erros: ['Esta aula foi excluída: não há ausência a registrar.'] }
  }
  if (pendenciaExistente) {
    return { ok: false, erros: ['Já existe um registro de ausência deste aluno nesta aula.'] }
  }

  // O aluno tem de estar matriculado na turma na data da aula: sem isso, a
  // pendência ficaria pendurada numa aula que nunca foi dele.
  const dia = String(aula.data_hora_referencia).slice(0, 10)
  const { data: matriculas } = await supabase
    .from('matriculas')
    .select('id, data_fim')
    .eq('aluno_id', alunoId)
    .eq('turma_id', aula.turma_id)
    .eq('status', 'Ativa')
    .lte('data_inicio', dia)

  const matriculado = (matriculas ?? []).some((m) => !m.data_fim || String(m.data_fim) >= dia)
  if (!matriculado) {
    return { ok: false, erros: ['Este aluno não está matriculado nesta turma na data da aula.'] }
  }

  const { data: criada, error } = await supabase
    .from('pendencias_reposicao')
    .insert({
      aluno_id: alunoId,
      aula_origem_id: aulaOrigemId,
      origem: 'Aviso',
      ...(decisao.gerarReposicao
        ? { status: 'Pendente' }
        : {
            status: 'Desistida',
            cobrar: decisao.cobrar,
            pagar_professor: decisao.pagarProfessor,
            decidido_em: new Date().toISOString(),
          }),
    })
    .select('id')
    .single()

  if (error) return { ok: false, erros: [error.message] }
  const r = decisao.gerarReposicao ? { ok: true } : await aplicarEfeitoFinanceiro(criada.id)
  // O aviso tira o aluno da ocorrencia do dia no evento do professor.
  return { ...r, turmasAfetadas: [aula.turma_id] }
}

/**
 * Não cobrar uma aula que já foi cobrada vira crédito do responsável. Se ainda
 * não foi, não há nada a fazer aqui: a geração de cobrança já a deixa de fora.
 */
async function aplicarEfeitoFinanceiro(
  pendenciaId: number,
): Promise<{ ok: boolean; erros?: string[] }> {
  const supabase = await clienteServidor()
  const { data: p } = await supabase
    .from('pendencias_reposicao')
    .select(
      'id, aluno_id, aula_origem_id, origem, cobrar, aluno:alunos!aluno_id (nome, responsavel_id), aula:aulas!aula_origem_id (data_hora_inicio, turma:turmas!turma_id (nome))',
    )
    .eq('id', pendenciaId)
    .maybeSingle()

  if (!p || p.cobrar !== false) return { ok: true }

  const lerItem = async () => {
    const { data } = await supabase
      .from('itens_cobranca')
      .select('id, valor_final, cobranca:cobrancas!cobranca_id (status)')
      .eq('aula_id', p.aula_origem_id)
      .eq('aluno_id', p.aluno_id)
      .maybeSingle()
    return {
      item: data,
      cobranca: (data?.cobranca ?? null) as unknown as { status: StatusCobranca } | null,
    }
  }

  let { item, cobranca } = await lerItem()

  // Item so em rascunho (14/10/2026): a aula ainda nao foi cobrada de ninguem,
  // entao nao ha credito — o item sai do rascunho e o total acompanha. Antes
  // virava credito e o item ficava la: o responsavel pagava e ainda ganhava
  // o credito. A saida e uma funcao do banco, com o rascunho travado: se a
  // cobranca foi confirmada no meio do caminho ela devolve false, e segue o
  // caminho do credito com o estado novo.
  if (item && cobranca?.status === 'Rascunho') {
    const { data: saiu, error } = await supabase.rpc('remover_item_de_rascunho', { p_item_id: item.id })
    if (error) {
      return { ok: false, erros: [`A decisão foi salva, mas o item do rascunho não saiu: ${error.message}`] }
    }
    if (saiu) return { ok: true }
    ;({ item, cobranca } = await lerItem())
  }

  const valor = creditoDaDesistencia(
    false,
    item && cobranca
      ? { valor_final: deNumeric(item.valor_final), cobranca_status: cobranca.status }
      : null,
  )
  if (valor === 0) return { ok: true }

  const aluno = p.aluno as unknown as { nome: string; responsavel_id: number } | null
  const aula = p.aula as unknown as {
    data_hora_inicio: string
    turma: { nome: string } | null
  } | null
  if (!aluno) return { ok: false, erros: ['Aluno não encontrado para gerar o crédito.'] }

  const dia = String(aula?.data_hora_inicio ?? '').slice(0, 10)
  const motivo = { Aviso: 'avisou que não viria', Falta: 'faltou', Exclusão: 'teve a aula excluída' }[p.origem as OrigemAusencia]

  const { error } = await supabase.from('creditos').insert({
    responsavel_id: aluno.responsavel_id,
    aluno_id: p.aluno_id,
    pendencia_id: p.id,
    valor: paraNumeric(valor),
    descricao: `${aluno.nome} ${motivo} à aula de ${dia.slice(8, 10)}/${dia.slice(5, 7)} (${aula?.turma?.nome ?? 'turma'}), que já tinha sido cobrada e foi dispensada.`,
  })

  if (error) {
    return { ok: false, erros: [`A decisão foi salva, mas o crédito falhou: ${error.message}`] }
  }
  return { ok: true }
}

/**
 * Aviso registrado por engano, ou o aluno acabou vindo: some como se nunca
 * tivesse existido, enquanto nada aconteceu por causa dele.
 */
export async function cancelarAviso(
  pendenciaId: number,
): Promise<{ ok: boolean; erros?: string[]; turmasAfetadas?: number[] }> {
  const supabase = await clienteServidor()
  const [{ data: p }, { count: creditos }, { count: pagos }] = await Promise.all([
    supabase
      .from('pendencias_reposicao')
      .select('id, origem, status, aula:aulas!aula_origem_id (status, turma_id)')
      .eq('id', pendenciaId)
      .maybeSingle(),
    supabase
      .from('creditos')
      .select('id', { count: 'exact', head: true })
      .eq('pendencia_id', pendenciaId),
    supabase
      .from('itens_conta_pagar_professor')
      .select('id', { count: 'exact', head: true })
      .eq('pendencia_id', pendenciaId),
  ])

  if (!p) return { ok: false, erros: ['Aviso não encontrado.'] }

  const permissao = podeCancelarAviso({
    origem: p.origem,
    status: p.status,
    aulaExcluida: (p.aula as unknown as { status: string } | null)?.status === 'Excluída',
    temCredito: (creditos ?? 0) > 0,
    pagoAoProfessor: (pagos ?? 0) > 0,
  })
  if (!permissao.pode) return { ok: false, erros: [permissao.motivo] }

  const { error } = await supabase.from('pendencias_reposicao').delete().eq('id', pendenciaId)
  if (error) return { ok: false, erros: [error.message] }
  // O aluno volta para a ocorrencia do dia no evento do professor.
  const turmaId = (p.aula as unknown as { turma_id: number } | null)?.turma_id
  return { ok: true, turmasAfetadas: turmaId ? [turmaId] : [] }
}
