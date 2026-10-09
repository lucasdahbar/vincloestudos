import type { Frequencia, StatusTurma, TipoRecorrencia } from '@/dominio/tipos'

/**
 * Rodada 4: a regra de recorrência da turma, no desenho do Google Agenda —
 * "a cada N dias/semanas/meses", com início e fim.
 *
 * Datas em ISO (AAAA-MM-DD) e aritmética em UTC: o fuso nunca muda o dia no
 * meio da conta.
 */
export interface RegraRecorrencia {
  frequencia: Frequencia
  /** "A cada N". Sempre >= 1. */
  intervalo: number
  /** Só na Semanal. Mesmo índice de Date.getDay(): 0 = domingo. */
  dias_semana: number[]
  data_inicio: string
  data_fim: string
}

export function paraUTC(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

export function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function somarDias(iso: string, dias: number): string {
  const d = paraUTC(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraISO(d)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / 86_400_000)
}

const DIAS_UTEIS = [1, 2, 3, 4, 5]

const iguais = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

const ordenados = (dias: number[]) => [...new Set(dias)].sort((a, b) => a - b)

/**
 * As datas da regra dentro de [de, ate] e do período da turma, inclusive nas
 * pontas.
 *
 * A âncora é sempre a data de início, nunca a janela pedida: abrir a agenda em
 * outro mês não pode mudar qual semana do quinzenal vale.
 */
export function datasDaRegra(regra: RegraRecorrencia, de: string, ate: string): string[] {
  const inicio = de > regra.data_inicio ? de : regra.data_inicio
  const fim = ate < regra.data_fim ? ate : regra.data_fim
  if (inicio > fim) return []

  const intervalo = Math.max(1, Math.trunc(regra.intervalo))
  const ancora = paraUTC(regra.data_inicio)
  // A semana começa no domingo, como o WKST=SU que vai na RRULE do Google.
  const domingoDaAncora = somarDias(regra.data_inicio, -ancora.getUTCDay())
  const dias = new Set(regra.dias_semana)

  const datas: string[] = []
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    const data = paraUTC(d)

    if (regra.frequencia === 'Diária') {
      if (diasEntre(regra.data_inicio, d) % intervalo === 0) datas.push(d)
    } else if (regra.frequencia === 'Semanal') {
      const semana = Math.floor(diasEntre(domingoDaAncora, d) / 7)
      if (dias.has(data.getUTCDay()) && semana % intervalo === 0) datas.push(d)
    } else {
      const meses =
        (data.getUTCFullYear() - ancora.getUTCFullYear()) * 12 +
        (data.getUTCMonth() - ancora.getUTCMonth())
      if (data.getUTCDate() === ancora.getUTCDate() && meses % intervalo === 0) datas.push(d)
    }
  }

  return datas
}

const SINGULAR = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]
const PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados']

/** "Segunda-feira", "Segundas e quartas", "Segundas, quartas e sextas". */
export function listaDeDias(dias: number[]): string {
  const unicos = ordenados(dias)
  if (unicos.length === 0) return ''
  if (unicos.length === 1) return SINGULAR[unicos[0]]

  const nomes = unicos.map((d) => PLURAL[d])
  const lista = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `${lista[0].toUpperCase()}${lista.slice(1)}`
}

/** A regra por extenso, sem horário: "Terças e quintas, a cada 2 semanas". */
export function textoDaRegra(
  regra: Pick<RegraRecorrencia, 'frequencia' | 'intervalo' | 'dias_semana' | 'data_inicio'>,
): string {
  const n = Math.max(1, regra.intervalo)

  if (regra.frequencia === 'Diária') return n === 1 ? 'Todos os dias' : `A cada ${n} dias`

  if (regra.frequencia === 'Mensal') {
    const dia = Number(regra.data_inicio.slice(8, 10))
    return n === 1 ? `Todo dia ${dia} do mês` : `Dia ${dia}, a cada ${n} meses`
  }

  const dias = ordenados(regra.dias_semana)
  const base =
    n === 1 && iguais(dias, DIAS_UTEIS) ? 'De segunda a sexta' : listaDeDias(dias) || 'Toda semana'
  return n === 1 ? base : `${base}, a cada ${n} semanas`
}

/**
 * Sem fim informado, a turma vai até 31/12 do ano corrente — ou do ano em que
 * começa, se ela só começa no ano seguinte (senão nasceria sem aula).
 */
export function fimAutomatico(hoje: string, dataInicio: string): string {
  const ano = Math.max(Number(hoje.slice(0, 4)), Number(dataInicio.slice(0, 4)))
  return `${ano}-12-31`
}

export function resolverFim(
  informado: string | null,
  dataInicio: string,
  atual: { data_fim: string | null; fim_automatico: boolean } | null,
  hoje: string,
): { data_fim: string; fim_automatico: boolean } {
  if (informado) return { data_fim: informado, fim_automatico: false }

  const automatico = fimAutomatico(hoje, dataInicio)
  // Turma já renovada: salvá-la de novo sem informar fim não pode encurtá-la.
  if (atual?.fim_automatico && atual.data_fim && atual.data_fim > automatico) {
    return { data_fim: atual.data_fim, fim_automatico: true }
  }
  return { data_fim: automatico, fim_automatico: true }
}

/**
 * A faixa de renovação aparece a um mês do fim e continua depois dele: se a
 * gestora esqueceu em dezembro, em janeiro ainda dá para estender.
 */
export function deveOferecerRenovacao(
  turma: {
    status: StatusTurma
    tipo_recorrencia: TipoRecorrencia
    fim_automatico: boolean
    data_fim: string | null
  },
  hoje: string,
): boolean {
  if (turma.status !== 'Ativa' || turma.tipo_recorrencia !== 'Recorrente') return false
  if (!turma.fim_automatico || !turma.data_fim) return false
  return diasEntre(hoje, turma.data_fim) <= 31
}

export function fimRenovado(dataFim: string, hoje: string): string {
  const ano = dataFim < hoje ? Number(hoje.slice(0, 4)) : Number(dataFim.slice(0, 4)) + 1
  return `${ano}-12-31`
}

/** As opções do campo "Repetição" do formulário. */
export const OPCOES_REPETICAO = [
  'Único',
  'Diário',
  'Semanal',
  'Quinzenal',
  'Mensal',
  'Personalizado',
] as const
export type OpcaoRepeticao = (typeof OPCOES_REPETICAO)[number]

/** Qual opção mostrar ao editar uma turma, a partir da regra gravada. */
export function opcaoDaRegra(turma: {
  tipo_recorrencia: TipoRecorrencia
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[]
}): OpcaoRepeticao {
  if (turma.tipo_recorrencia === 'Único') return 'Único'

  const intervalo = turma.intervalo ?? 1
  const frequencia = turma.frequencia ?? 'Semanal'

  if (frequencia === 'Mensal' && intervalo === 1) return 'Mensal'
  if (frequencia === 'Semanal') {
    if (intervalo === 1 && iguais(ordenados(turma.dias_semana), DIAS_UTEIS)) return 'Diário'
    if (intervalo === 1) return 'Semanal'
    if (intervalo === 2) return 'Quinzenal'
  }
  return 'Personalizado'
}

/** A regra que cada opção pronta grava. "Diário" é de segunda a sexta. */
export function regraDaOpcao(
  opcao: 'Diário' | 'Semanal' | 'Quinzenal' | 'Mensal',
  dias: number[],
): { frequencia: Frequencia; intervalo: number; dias_semana: number[] } {
  switch (opcao) {
    case 'Diário':
      return { frequencia: 'Semanal', intervalo: 1, dias_semana: [...DIAS_UTEIS] }
    case 'Semanal':
      return { frequencia: 'Semanal', intervalo: 1, dias_semana: dias }
    case 'Quinzenal':
      return { frequencia: 'Semanal', intervalo: 2, dias_semana: dias }
    case 'Mensal':
      return { frequencia: 'Mensal', intervalo: 1, dias_semana: [] }
  }
}
