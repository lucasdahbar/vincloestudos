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
  /** Horário que a ocorrência tem hoje no Google, HH:MM no fuso da escola. */
  inicio?: string
  fim?: string
}

/**
 * As ocorrências passadas cujo horário no Google não é o da aula no sistema.
 *
 * Bug de 31/10/2026: mudar o horário da turma regrava a série inteira no
 * Google, e o Google muda junto as ocorrências que já passaram (a Biologia 2º
 * ano, das 19h, apareceu às 16h em 19 e 26/10). O sistema não mexe nas aulas
 * passadas, então é ele que diz o horário de cada uma.
 */
export function horariosPassadosDivergentes(
  ocorrencias: OcorrenciaNoGoogle[],
  aulas: { data: string; inicio: string; fim: string }[],
): { id: string; data: string; inicio: string; fim: string }[] {
  const porData = new Map(aulas.map((a) => [a.data, a]))
  return ocorrencias.flatMap((o) => {
    const aula = porData.get(o.data)
    if (!aula || !o.inicio || !o.fim) return []
    if (o.inicio === aula.inicio && o.fim === aula.fim) return []
    return [{ id: o.id, data: o.data, inicio: aula.inicio, fim: aula.fim }]
  })
}

/**
 * Entra na lista: matrícula ativa, inclusive de reposição. Correção de
 * 13/10/2026: antes a reposição ficava de fora, e o professor não sabia que o
 * aluno viria. A matrícula de reposição vale só na data da aula de destino,
 * então ela aparece só naquela ocorrência.
 */
const conta = (m: MatriculaDoEvento) => m.status === 'Ativa'

const porNome = (nomes: string[]) => nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'))

const nomeNaLista = (m: MatriculaDoEvento) => (m.flag_reposicao ? `${m.nome} (reposição)` : m.nome)

/**
 * Os alunos matriculados naquele dia. Quem avisou que não vem àquela aula
 * continua matriculado, mas sai da lista da ocorrência: o professor não deve
 * esperar por ele (a reposição, se houver, entra na ocorrência do destino).
 */
export function alunosNaData(matriculas: MatriculaDoEvento[], data: string): string[] {
  return porNome(
    matriculas
      .filter(
        (m) =>
          conta(m) &&
          m.data_inicio <= data &&
          (m.data_fim === null || m.data_fim >= data) &&
          !m.ausencias?.includes(data),
      )
      .map(nomeNaLista),
  )
}

/**
 * A lista da descrição geral da série: os alunos sem data para sair. É o que
 * vale nas ocorrências além do horizonte, onde não há mais mudança prevista.
 * Reposição nunca entra aqui: ela é de um dia só.
 */
export function alunosDaSerie(matriculas: MatriculaDoEvento[]): string[] {
  return porNome(
    matriculas
      .filter((m) => conta(m) && !m.flag_reposicao && m.data_fim === null)
      .map((m) => m.nome),
  )
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
 * Desde onde conferir as ocorrências: da matrícula ativa mais antiga (13/11/2026,
 * turma 31). Antes era de hoje em diante, e a aula passada herdava o texto geral
 * da série: quando um aluno ganhava data de fim e saía desse texto, as aulas em
 * que ele esteve ficavam com "Nenhum aluno matriculado" no Google do professor.
 */
export function inicioDoHorizonte(matriculas: MatriculaDoEvento[], hoje: string): string {
  return matriculas.filter(conta).reduce((a, m) => (m.data_inicio < a ? m.data_inicio : a), hoje)
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
    .flatMap((m) => [m.data_inicio, m.data_fim, ...(m.ausencias ?? [])])
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
