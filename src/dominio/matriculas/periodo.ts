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
