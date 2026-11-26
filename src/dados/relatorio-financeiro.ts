import 'server-only'
import { clienteServidor } from './cliente'
import { aulasDoMes, lerTudo, limitesDoMes } from './cobrancas'
import { deNumeric } from '@/dominio/dinheiro'
import {
  chaveDaLinha,
  juntarLinhas,
  previstasDaGeracao,
  type CobrancaDoRelatorio,
  type LinhaFinanceira,
  type Situacao,
} from '@/dominio/relatorios/financeiro'

/**
 * Base do relatorio financeiro de um mes (Julio, 25/11/2026). O mes e o da
 * aula para a cobranca (`data_hora_referencia`), o mesmo da geracao: a aula
 * remarcada para o mes seguinte continua vendida no mes de origem.
 *
 * So le. As regras ficam em `dominio/relatorios/financeiro.ts`.
 */
export async function baseDoRelatorioFinanceiro(mes: string): Promise<{
  linhas: LinhaFinanceira[]
  cobrancas: Map<number, CobrancaDoRelatorio>
}> {
  const supabase = await clienteServidor()
  const { primeiro, ultimo } = limitesDoMes(mes)
  const de = `${primeiro}T00:00:00`
  const ate = `${ultimo}T23:59:59`

  const [faturaveis, aulas, itens] = await Promise.all([
    aulasDoMes(mes),
    // O que descreve cada aula: o professor e o servico sao os DELA (Etapa 2),
    // que podem diferir dos da turma.
    lerTudo((a, b) =>
      supabase
        .from('aulas')
        .select(`
          id, data_hora_inicio, data_hora_fim, professor_id,
          professor:professores!professor_id (nome),
          servico:servicos!servico_id (nome),
          turma:turmas!turma_id (
            nome,
            materia:materias!materia_id (nome),
            ano_escolar:anos_escolares!ano_escolar_id (nome),
            escola:escolas!escola_id (nome)
          )
        `)
        .gte('data_hora_referencia', de)
        .lte('data_hora_referencia', ate)
        .order('id')
        .range(a, b),
    ),
    // Tudo que ja esta em cobranca, de qualquer status menos cancelada: e o
    // que diz o status de cada aula.
    lerTudo((a, b) =>
      supabase
        .from('itens_cobranca')
        .select(`
          aula_id, aluno_id, diferenca_id, valor_final,
          aluno:alunos!aluno_id (nome),
          cobranca:cobrancas!inner (id, status, valor_total, responsavel_id, responsavel:responsaveis!responsavel_id (nome)),
          aula:aulas!inner (data_hora_referencia)
        `)
        .neq('cobranca.status', 'Cancelada')
        .gte('aula.data_hora_referencia', de)
        .lte('aula.data_hora_referencia', ate)
        .order('id')
        .range(a, b),
    ),
  ])

  type Nome = { nome: string } | null
  const porAula = new Map(
    (aulas as unknown as {
      id: number
      data_hora_inicio: string
      data_hora_fim: string
      professor_id: number | null
      professor: Nome
      servico: Nome
      turma: { nome: string; materia: Nome; ano_escolar: Nome; escola: Nome } | null
    }[]).map((a) => [a.id, a]),
  )

  /** O que vem da aula, igual para os dois lados (cobrado e previsto). */
  const daAula = (aulaId: number) => {
    const a = porAula.get(aulaId)
    return {
      data: '',
      inicio: a ? String(a.data_hora_inicio).slice(11, 16) : '',
      fim: a ? String(a.data_hora_fim).slice(11, 16) : '',
      professor_id: a?.professor_id ?? null,
      professor: a?.professor?.nome ?? '',
      materia: a?.turma?.materia?.nome ?? '',
      ano_escolar: a?.turma?.ano_escolar?.nome ?? '',
      escola: a?.turma?.escola?.nome ?? '',
      turma: a?.turma?.nome ?? '',
      servico: a?.servico?.nome ?? '',
    }
  }

  const doItem = itens as unknown as {
    aula_id: number
    aluno_id: number
    diferenca_id: number | null
    valor_final: string
    aluno: Nome
    cobranca: { id: number; status: string; valor_total: string; responsavel_id: number; responsavel: Nome }
    aula: { data_hora_referencia: string }
  }[]

  const emCobranca: LinhaFinanceira[] = doItem.map((i) => ({
    ...daAula(i.aula_id),
    chave: chaveDaLinha(i.aula_id, i.aluno_id, i.diferenca_id),
    data: String(i.aula.data_hora_referencia).slice(0, 10),
    aluno_id: i.aluno_id,
    aluno: i.aluno?.nome ?? '',
    responsavel_id: i.cobranca.responsavel_id,
    responsavel: i.cobranca.responsavel?.nome ?? '',
    valor: deNumeric(i.valor_final),
    situacao: i.cobranca.status as Situacao,
    cobranca_id: i.cobranca.id,
  }))

  const pessoa = new Map(faturaveis.map((f) => [`${f.aula_id}:${f.aluno_id}`, f]))
  const previstas: LinhaFinanceira[] = previstasDaGeracao(faturaveis).map((p) => {
    const f = pessoa.get(`${p.aula_id}:${p.aluno_id}`)!
    return {
      ...daAula(p.aula_id),
      chave: p.chave,
      data: f.data,
      aluno_id: p.aluno_id,
      aluno: f.aluno_nome,
      responsavel_id: f.responsavel_id,
      responsavel: f.responsavel_nome,
      valor: p.valor,
      situacao: p.situacao,
      cobranca_id: null,
    }
  })

  // Os recebimentos das cobrancas que aparecem, aos pedacos para a URL do
  // filtro `in` nao estourar.
  const cobrancas = new Map<number, CobrancaDoRelatorio>()
  for (const i of doItem) {
    if (!cobrancas.has(i.cobranca.id)) {
      cobrancas.set(i.cobranca.id, { id: i.cobranca.id, valor_total: deNumeric(i.cobranca.valor_total), recebimentos: [] })
    }
  }
  const ids = [...cobrancas.keys()]
  for (let k = 0; k < ids.length; k += 200) {
    const { data, error } = await supabase
      .from('recebimentos')
      .select('cobranca_id, valor_recebido, conta:contas!conta_id (nome)')
      .in('cobranca_id', ids.slice(k, k + 200))
    if (error) throw new Error(`Falha ao ler os recebimentos: ${error.message}`)
    for (const r of (data ?? []) as unknown as { cobranca_id: number; valor_recebido: string; conta: Nome }[]) {
      cobrancas.get(r.cobranca_id)!.recebimentos.push({ valor: deNumeric(r.valor_recebido), conta: r.conta?.nome ?? null })
    }
  }

  return { linhas: juntarLinhas(emCobranca, previstas), cobrancas }
}
