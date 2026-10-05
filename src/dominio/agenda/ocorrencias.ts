import type { MatriculaDoEvento } from './evento-google'

/**
 * Quem aparece em cada ocorrência do evento recorrente da turma.
 *
 * O evento recorrente tem uma descrição só, herdada por todas as ocorrências.
 * Um aluno que faz uma aula só (matrícula com início e fim no mesmo dia)
 * apareceria em todas as semanas seguintes. O Google deixa editar ocorrências
 * uma a uma: a série leva os alunos fixos, e a ocorrência cuja turma do dia é
 * outra ganha descrição própria.
 */

export interface OcorrenciaNoGoogle {
  /** Id da ocorrência no Google (`<evento>_<data>`). */
  id: string
  /** Data da ocorrência no fuso da escola, AAAA-MM-DD. */
  data: string
  descricao: string | null
}

/** Entra na lista: matrícula ativa e regular. Reposição tem sua própria aula. */
const conta = (m: MatriculaDoEvento) => m.status === 'Ativa' && !m.flag_reposicao

const porNome = (nomes: string[]) => nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'))

/** Os alunos matriculados naquele dia. */
export function alunosNaData(matriculas: MatriculaDoEvento[], data: string): string[] {
  return porNome(
    matriculas
      .filter((m) => conta(m) && m.data_inicio <= data && (m.data_fim === null || m.data_fim >= data))
      .map((m) => m.nome),
  )
}

/**
 * A lista da descrição geral da série: os alunos sem data para sair. É o que
 * vale nas ocorrências além do horizonte, onde não há mais mudança prevista.
 */
export function alunosDaSerie(matriculas: MatriculaDoEvento[]): string[] {
  return porNome(matriculas.filter((m) => conta(m) && m.data_fim === null).map((m) => m.nome))
}

/** As ocorrências cuja descrição no Google não bate com a turma daquele dia. */
export function ajustesDasOcorrencias(
  ocorrencias: OcorrenciaNoGoogle[],
  matriculas: MatriculaDoEvento[],
  descrever: (alunos: string[]) => string,
): { id: string; descricao: string }[] {
  return ocorrencias.flatMap((o) => {
    const descricao = descrever(alunosNaData(matriculas, o.data))
    return o.descricao === descricao ? [] : [{ id: o.id, descricao }]
  })
}

/**
 * Até onde conferir as ocorrências: um ano, ou uma semana depois da última
 * data em que a turma muda, o que for mais longe. Depois disso a lista de cada
 * ocorrência é a da série, e herdar dela já está certo.
 */
export function fimDoHorizonte(matriculas: MatriculaDoEvento[], hoje: string): string {
  const umAno = somarDias(hoje, 0, 1)
  const datas = matriculas
    .filter(conta)
    .flatMap((m) => [m.data_inicio, m.data_fim])
    .filter((d): d is string => d !== null)
  const ultima = datas.reduce((a, b) => (b > a ? b : a), '')
  const depois = ultima ? somarDias(ultima, 7) : ''
  return depois > umAno ? depois : umAno
}

function somarDias(iso: string, dias: number, anos = 0): string {
  const [a, m, d] = iso.split('-').map(Number)
  const data = new Date(Date.UTC(a + anos, m - 1, d + dias))
  return data.toISOString().slice(0, 10)
}
