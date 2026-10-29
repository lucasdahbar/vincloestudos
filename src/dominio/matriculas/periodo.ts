import type { StatusAula } from '@/dominio/tipos'

/**
 * Matricula sem aula no periodo (pedido do Julio, 20/10/2026).
 *
 * Caso Kelly (17/10/2026): pela tela da turma, a matricula de um dia so foi
 * gravada numa data em que a turma nao tinha aula. O aluno aparecia na turma,
 * mas nao na aula nem no Google, porque esses dois olham a data. Decisao:
 * bloquear, e a gestora corrige as datas antes de salvar.
 */

export interface AulaDaTurma {
  /** yyyy-mm-dd da regra da turma: e por ela que a matricula e conferida. */
  referencia: string
  /** yyyy-mm-dd em que a aula acontece (difere da referencia se foi remarcada). */
  real: string
  status: StatusAula
}

/** So estas tem aluno na lista: excluida, cancelada e feriado nao acontecem. */
const ACONTECE: readonly StatusAula[] = ['Agendada', 'Realizada']

function br(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
}

function dentro(dia: string, inicio: string, fim: string | null): boolean {
  return dia >= inicio && (fim === null || dia <= fim)
}

/** A mensagem de bloqueio, ou null se o periodo pega pelo menos uma aula. */
export function erroDePeriodoSemAula(
  periodo: { data_inicio: string; data_fim: string | null },
  aulasDaTurma: AulaDaTurma[],
): string | null {
  const { data_inicio: inicio, data_fim: fim } = periodo
  const aulas = aulasDaTurma.filter((a) => ACONTECE.includes(a.status))

  if (aulas.some((a) => dentro(a.referencia, inicio, fim))) return null

  // A armadilha da remarcacao: a gestora informa o dia em que a aula acontece,
  // mas a lista confere pela data original.
  const remarcada = aulas.find((a) => a.real !== a.referencia && dentro(a.real, inicio, fim))
  if (remarcada) {
    return (
      `A aula de ${br(remarcada.referencia)} foi remarcada para ${br(remarcada.real)}, ` +
      `mas a matrícula vale pela data original: informe ${br(remarcada.referencia)}.`
    )
  }

  const periodoTexto = fim === null ? `a partir de ${br(inicio)}` : fim === inicio ? `em ${br(inicio)}` : `entre ${br(inicio)} e ${br(fim)}`
  const proxima = aulas
    .map((a) => a.referencia)
    .filter((d) => d > inicio)
    .sort()[0]

  return (
    `Esta turma não tem aula ${periodoTexto}, e o aluno não apareceria em nenhuma aula. ` +
    (proxima
      ? `A próxima aula da turma é em ${br(proxima)}.`
      : 'A turma não tem mais aulas: se ela continua, renove-a antes de matricular.')
  )
}

export interface AulaComChamada extends AulaDaTurma {
  /** A chamada da aula ja foi feita: tem presenca ou falta registrada. */
  comChamada: boolean
  /** O aluno desta matricula ja esta nessa chamada. */
  alunoNaChamada: boolean
}

/**
 * Decisao 12 do Julio (28/10/2026): matricula com data passada nao pode pegar
 * uma aula cuja chamada ja foi feita. O aluno entraria numa lista fechada, sem
 * presenca nem falta, e a cobranca e o pagamento do professor sairiam de uma
 * aula que nao o teve. So conta o que a matricula acrescenta: editar outra coisa
 * numa matricula antiga nao bloqueia.
 */
export function erroDeAulaComChamada(
  periodo: { data_inicio: string; data_fim: string | null },
  anterior: { data_inicio: string; data_fim: string | null } | null,
  aulasDaTurma: AulaComChamada[],
): string | null {
  const fechadas = aulasDaTurma
    .filter((a) => ACONTECE.includes(a.status) && a.comChamada && !a.alunoNaChamada)
    .filter((a) => dentro(a.referencia, periodo.data_inicio, periodo.data_fim))
    .filter((a) => !anterior || !dentro(a.referencia, anterior.data_inicio, anterior.data_fim))
    .map((a) => a.referencia)
    .sort()

  if (fechadas.length === 0) return null
  const dias = fechadas.map(br).join(', ')
  const ultima = fechadas[fechadas.length - 1]
  const proxima = aulasDaTurma
    .filter((a) => ACONTECE.includes(a.status) && !a.comChamada && a.referencia > ultima)
    .map((a) => a.referencia)
    .sort()[0]
  const sugestao = proxima ? ` A próxima aula sem chamada é em ${br(proxima)}.` : ''
  return fechadas.length === 1
    ? `A aula de ${dias} já teve a chamada feita, e o aluno não pode entrar nela depois.${sugestao}`
    : `As aulas de ${dias} já tiveram a chamada feita, e o aluno não pode entrar nelas depois.${sugestao}`
}
