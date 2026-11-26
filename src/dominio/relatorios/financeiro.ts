import { somar, type Centavos } from '@/dominio/dinheiro'
import { faturavel, montarCobrancas, type AulaFaturavel } from '@/dominio/cobrancas/geracao'
import { rotuloDoStatus } from '@/dominio/cobrancas/lista'

/**
 * Relatorio financeiro (pedido do Julio, 25/11/2026). A Kelly olhava primeiro
 * o "total vendido" das aulas lancadas na agenda e dai filtrava por escola,
 * aluno, responsavel, professor, materia, status da cobranca e conta.
 *
 * Cada linha e uma aula de um aluno, tirada da agenda e nao da cobranca: o
 * que ainda nao foi cobrado tambem e venda. Decisoes do Julio (26/11/2026):
 * - "Vendido" e toda aula do mes que nao foi cancelada nem excluida, inclusive
 *   as que ainda vao acontecer (a mesma regra da geracao, `faturavel`). A aula
 *   que a gestora decidiu nao cobrar sai do vendido e aparece a parte.
 * - O recebimento entra por cobranca, nao por aula: o filtro de conta vale para
 *   o recebido, e o recebido de cada linha e rateado pela parte da cobranca
 *   que ela representa.
 */

/** O status da cobranca da linha, ou o que ela e fora de cobranca. */
export type Situacao =
  | 'Sem cobrança'
  | 'Rascunho'
  | 'Confirmada'
  | 'Enviada'
  | 'Parcial'
  | 'Quitada'
  | 'Não cobrada'

export const SITUACOES: Situacao[] = [
  'Sem cobrança',
  'Rascunho',
  'Confirmada',
  'Enviada',
  'Parcial',
  'Quitada',
  'Não cobrada',
]

/** Ja saiu para a familia: conta no "a receber". */
const ENVIADAS: Situacao[] = ['Enviada', 'Parcial', 'Quitada']

export interface LinhaFinanceira {
  /** aula:aluno, ou aula:aluno:d<id> no item da diferenca de servico. */
  chave: string
  /** Dia que a turma considera para a aula (o da cobranca), AAAA-MM-DD. */
  data: string
  inicio: string
  fim: string
  aluno_id: number
  aluno: string
  responsavel_id: number
  responsavel: string
  professor_id: number | null
  professor: string
  materia: string
  ano_escolar: string
  escola: string
  turma: string
  servico: string
  valor: Centavos
  situacao: Situacao
  cobranca_id: number | null
}

export interface CobrancaDoRelatorio {
  id: number
  valor_total: Centavos
  /** `conta` nula: abatido de credito, sem conta. */
  recebimentos: { valor: Centavos; conta: string | null }[]
}

/** Recebimento sem conta e o credito abatido (Rodada 3). */
const SEM_CONTA = 'Crédito'

export function chaveDaLinha(aulaId: number, alunoId: number, diferencaId?: number | null): string {
  return diferencaId ? `${aulaId}:${alunoId}:d${diferencaId}` : `${aulaId}:${alunoId}`
}

export interface Prevista {
  chave: string
  aula_id: number
  aluno_id: number
  valor: Centavos
  situacao: 'Sem cobrança' | 'Não cobrada'
}

/**
 * O que a geracao poria na cobranca (mesma regra e mesmo valor, para o
 * relatorio nunca divergir dela), mais a aula que a gestora decidiu nao
 * cobrar, que so nao entra por essa decisao.
 */
export function previstasDaGeracao(aulas: AulaFaturavel[]): Prevista[] {
  const aCobrar = montarCobrancas(aulas).flatMap((c) =>
    c.itens.map((i) => ({
      chave: chaveDaLinha(i.aula_id, i.aluno_id, i.diferenca_id),
      aula_id: i.aula_id,
      aluno_id: i.aluno_id,
      valor: i.valor_final,
      situacao: 'Sem cobrança' as const,
    })),
  )
  const naoCobradas = aulas
    .filter((a) => a.ausencia?.cobrar === false && faturavel({ ...a, ausencia: null }))
    .map((a) => ({
      chave: chaveDaLinha(a.aula_id, a.aluno_id, a.diferenca?.id),
      aula_id: a.aula_id,
      aluno_id: a.aluno_id,
      valor: a.valor,
      situacao: 'Não cobrada' as const,
    }))
  return [...aCobrar, ...naoCobradas]
}

/**
 * Junta o que ja esta em cobranca com o que a geracao poria nela. A linha da
 * cobranca vale mais: tem o desconto e o status de verdade.
 */
export function juntarLinhas(
  emCobranca: LinhaFinanceira[],
  previstas: LinhaFinanceira[],
): LinhaFinanceira[] {
  const porChave = new Map(emCobranca.map((l) => [l.chave, l]))
  for (const l of previstas) if (!porChave.has(l.chave)) porChave.set(l.chave, l)
  return [...porChave.values()].sort(
    (a, b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio) || a.aluno.localeCompare(b.aluno),
  )
}

export interface FiltrosFinanceiros {
  aluno_id?: number
  responsavel_id?: number
  professor_id?: number
  materia?: string
  ano_escolar?: string
  escola?: string
  turma?: string
  servico?: string
  situacao?: Situacao
}

export function filtrarLinhas(linhas: LinhaFinanceira[], f: FiltrosFinanceiros): LinhaFinanceira[] {
  return linhas.filter(
    (l) =>
      (f.aluno_id === undefined || l.aluno_id === f.aluno_id) &&
      (f.responsavel_id === undefined || l.responsavel_id === f.responsavel_id) &&
      (f.professor_id === undefined || l.professor_id === f.professor_id) &&
      (f.materia === undefined || l.materia === f.materia) &&
      (f.ano_escolar === undefined || l.ano_escolar === f.ano_escolar) &&
      (f.escola === undefined || l.escola === f.escola) &&
      (f.turma === undefined || l.turma === f.turma) &&
      (f.servico === undefined || l.servico === f.servico) &&
      (f.situacao === undefined || l.situacao === f.situacao),
  )
}

export interface Totais {
  vendido: Centavos
  naoCobrado: Centavos
  porSituacao: Record<Situacao, Centavos>
  recebido: Centavos
  /** O que ja foi enviado e ainda nao entrou. */
  aReceber: Centavos
  porConta: { conta: string; valor: Centavos }[]
}

/**
 * Totais das linhas. `conta`, quando dada, restringe so o recebido: o vendido
 * nao tem conta.
 */
export function calcularTotais(
  linhas: LinhaFinanceira[],
  cobrancas: Map<number, CobrancaDoRelatorio>,
  conta?: string,
): Totais {
  const porSituacao = Object.fromEntries(SITUACOES.map((s) => [s, 0])) as Record<Situacao, Centavos>
  const porConta = new Map<string, number>()
  let recebidoTotal = 0
  let aReceber = 0

  for (const l of linhas) {
    porSituacao[l.situacao] += l.valor
    const c = l.cobranca_id !== null ? cobrancas.get(l.cobranca_id) : undefined

    // A parte da cobranca que a linha representa. Se a familia pagou metade,
    // metade de cada aula esta paga; nunca mais que a aula vale.
    let recebidoDaLinha = 0
    if (c && c.valor_total > 0) {
      const somaRecebida = somar(...c.recebimentos.map((r) => r.valor))
      const fator = Math.min(1, somaRecebida / c.valor_total)
      for (const r of c.recebimentos) {
        const nome = r.conta ?? SEM_CONTA
        const parte = somaRecebida > 0 ? (l.valor * fator * r.valor) / somaRecebida : 0
        recebidoDaLinha += parte
        if (conta === undefined || conta === nome) {
          porConta.set(nome, (porConta.get(nome) ?? 0) + parte)
          recebidoTotal += parte
        }
      }
    }
    if (ENVIADAS.includes(l.situacao)) aReceber += l.valor - recebidoDaLinha
  }

  return {
    vendido: linhas.filter((l) => l.situacao !== 'Não cobrada').reduce((s, l) => s + l.valor, 0),
    naoCobrado: porSituacao['Não cobrada'],
    porSituacao,
    recebido: Math.round(recebidoTotal),
    aReceber: Math.round(aReceber),
    porConta: [...porConta]
      .map(([nome, valor]) => ({ conta: nome, valor: Math.round(valor) }))
      .sort((a, b) => b.valor - a.valor),
  }
}

export type Dimensao =
  | 'escola'
  | 'aluno'
  | 'responsavel'
  | 'professor'
  | 'materia'
  | 'ano_escolar'
  | 'turma'
  | 'servico'
  | 'situacao'

export const DIMENSOES: { valor: Dimensao; rotulo: string }[] = [
  { valor: 'escola', rotulo: 'Escola' },
  { valor: 'responsavel', rotulo: 'Responsável' },
  { valor: 'aluno', rotulo: 'Aluno' },
  { valor: 'professor', rotulo: 'Professor' },
  { valor: 'materia', rotulo: 'Matéria' },
  { valor: 'ano_escolar', rotulo: 'Ano escolar' },
  { valor: 'turma', rotulo: 'Turma' },
  { valor: 'servico', rotulo: 'Serviço' },
  { valor: 'situacao', rotulo: 'Status da cobrança' },
]

export interface Grupo {
  rotulo: string
  aulas: number
  totais: Totais
}

/** As mesmas contas, separadas por uma dimensao, do maior vendido para o menor. */
export function agrupar(
  linhas: LinhaFinanceira[],
  dimensao: Dimensao,
  cobrancas: Map<number, CobrancaDoRelatorio>,
  conta?: string,
): Grupo[] {
  const grupos = new Map<string, LinhaFinanceira[]>()
  for (const l of linhas) {
    const k = String(l[dimensao] || '—')
    grupos.set(k, [...(grupos.get(k) ?? []), l])
  }
  return [...grupos]
    .map(([rotulo, doGrupo]) => ({
      rotulo,
      aulas: doGrupo.length,
      totais: calcularTotais(doGrupo, cobrancas, conta),
    }))
    .sort((a, b) => b.totais.vendido - a.totais.vendido || a.rotulo.localeCompare(b.rotulo))
}

const COLUNAS: [string, (l: LinhaFinanceira) => string][] = [
  ['Data', (l) => l.data.split('-').reverse().join('/')],
  ['Início', (l) => l.inicio],
  ['Fim', (l) => l.fim],
  ['Aluno', (l) => l.aluno],
  ['Responsável', (l) => l.responsavel],
  ['Professor', (l) => l.professor],
  ['Escola', (l) => l.escola],
  ['Matéria', (l) => l.materia],
  ['Ano escolar', (l) => l.ano_escolar],
  ['Turma', (l) => l.turma],
  ['Serviço', (l) => l.servico],
  // Virgula decimal e sem "R$": o Excel em portugues le como numero e soma.
  ['Valor', (l) => (l.valor / 100).toFixed(2).replace('.', ',')],
  ['Status', (l) => rotuloDoStatus(l.situacao)],
  ['Cobrança', (l) => (l.cobranca_id ? String(l.cobranca_id) : '')],
]

/** Campo com separador, aspas ou quebra de linha vai entre aspas. */
function celula(valor: string): string {
  return /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/**
 * Exportar para o Excel (a Kelly confere com a planilha dela). Ponto e
 * virgula e o separador que o Excel em portugues abre direto, e a marca de
 * UTF-8 no comeco faz ele ler os acentos.
 */
export function paraCsv(linhas: LinhaFinanceira[]): string {
  const corpo = [
    COLUNAS.map(([nome]) => nome).join(';'),
    ...linhas.map((l) => COLUNAS.map(([, valor]) => celula(valor(l))).join(';')),
  ]
  return `﻿${corpo.join('\r\n')}`
}
