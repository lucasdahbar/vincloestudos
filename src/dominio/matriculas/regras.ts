import { somarDias } from '@/dominio/agenda/recorrencia'
import type { StatusTurma } from '@/dominio/tipos'

export interface TurmaDaMatricula {
  status: StatusTurma
}

/** Uma matricula que ja existe para o mesmo par (aluno, turma). */
export interface PeriodoMatriculado {
  id: number | null
  data_inicio: string
  data_fim: string | null
}

export interface EntradaMatricula {
  aluno_id: number | null
  turma_id: number | null
  /** Datas em ISO (AAAA-MM-DD), comparaveis lexicograficamente. */
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
  alunoAtivo: boolean
  /** Quando esta editando, o id da propria matricula: ela nao conflita consigo. */
  id?: number | null
}

/** Modulos Operacionais, secao 3.2. */
export function validarMatricula(
  matricula: EntradaMatricula,
  turma: TurmaDaMatricula,
  /** M1: as outras matriculas do mesmo aluno na mesma turma. */
  jaMatriculado: PeriodoMatriculado[] = [],
): string[] {
  const erros: string[] = []

  if (matricula.aluno_id === null) erros.push('Selecione o aluno.')
  if (matricula.turma_id === null) erros.push('Selecione a turma.')
  if (!matricula.alunoAtivo) erros.push('Este aluno está inativo.')

  if (turma.status !== 'Ativa') {
    erros.push('Esta turma está encerrada e não aceita novas matrículas.')
  }

  if (matricula.data_inicio === '') {
    erros.push('Informe a data de início.')
  } else {
    // M2: a regra antiga era `>`, que barrava a matricula de um dia so — o
    // aluno que participa de um unico aulao avulso.
    if (matricula.data_fim !== null && matricula.data_fim < matricula.data_inicio) {
      erros.push('A data de fim não pode ser anterior à data de início.')
    }

    if (seSobrepoe(matricula, jaMatriculado)) {
      erros.push(
        'Este aluno já possui uma matrícula nesta turma no período informado. ' +
          'Encerre a matrícula atual antes de criar uma nova.',
      )
    }
  }

  return erros
}

/**
 * M1: o mesmo aluno pode entrar e sair da mesma turma varias vezes ao longo do
 * tempo, mas nunca ter dois periodos simultaneos nela.
 *
 * Data de fim vazia significa "sem data prevista para terminar": para efeito da
 * comparacao, o periodo vai ate o infinito.
 */
export function seSobrepoe(
  matricula: EntradaMatricula,
  jaMatriculado: PeriodoMatriculado[],
): boolean {
  const SEM_FIM = '9999-12-31'
  const inicio = matricula.data_inicio
  const fim = matricula.data_fim ?? SEM_FIM

  return jaMatriculado.some((outra) => {
    if (matricula.id != null && outra.id === matricula.id) return false
    return inicio <= (outra.data_fim ?? SEM_FIM) && outra.data_inicio <= fim
  })
}

/**
 * Secao 3.3: o formulario exibe um aviso quando a matricula e de reposicao,
 * porque a consequencia (nao gerar cobranca) nao e obvia pelo nome do campo.
 */
export function avisoDeReposicao(flagReposicao: boolean): string | null {
  return flagReposicao
    ? 'Esta matrícula é apenas para uma reposição: ela não gera cobrança para o responsável.'
    : null
}

export type Desmatricula =
  | { acao: 'encerrar'; data_fim: string; status: 'Ativa' | 'Encerrada' }
  | { acao: 'excluir' }
  | { acao: 'recusar'; motivo: string }

const br = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

/**
 * Pedido do Julio (03/11/2026): desmatricular informando a data a partir da
 * qual o aluno sai, porque ele pode ainda fazer algumas aulas. A data e o
 * primeiro dia SEM ele, e a matricula grava o fim na vespera (data_fim inclui
 * o dia). Sair hoje tira o aluno da aula de hoje, como ja era.
 *
 * Com a saida no futuro a matricula continua Ativa: a lista da aula, o evento
 * do Google e a exclusao de aula so olham matricula Ativa, e o aluno sumiria
 * antes da hora. A data_fim e que o tira das aulas depois dela.
 *
 * Data no passado vale, menos se a chamada ja o registrou (presenca ou falta)
 * numa aula a partir dela: a aula aconteceu com ele. Mesmo espirito da
 * Decisao 12, ao contrario.
 *
 * A matricula que nao chega a ter um dia antes da saida (ainda nao comecou)
 * e excluida: fim antes do inicio o banco recusa (M2, erro de 14/10/2026), e
 * sem aula nao ha historico a preservar.
 */
export function comoDesmatricular(
  matricula: { data_inicio: string; data_fim: string | null },
  entrada: {
    /** Primeiro dia sem o aluno, AAAA-MM-DD. */
    saida: string
    /** Hoje no relogio da escola, AAAA-MM-DD. */
    hoje: string
    /** Datas de referencia das aulas da turma em que a chamada tem o aluno. */
    chamadasDoAluno: string[]
  },
): Desmatricula {
  const { saida, hoje } = entrada
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saida)) return { acao: 'recusar', motivo: 'Informe a data de saída.' }

  const data_fim = somarDias(saida, -1)
  if (matricula.data_fim !== null && data_fim >= matricula.data_fim) {
    return {
      acao: 'recusar',
      motivo: `A matrícula já termina em ${br(matricula.data_fim)}. Para sair depois disso, mude a data de fim acima.`,
    }
  }

  const depois = entrada.chamadasDoAluno
    .filter((d) => d >= saida && d >= matricula.data_inicio && (matricula.data_fim === null || d <= matricula.data_fim))
    .sort()
  if (depois.length > 0) {
    const ultima = depois[depois.length - 1]
    const dias = depois.map(br).join(', ')
    return {
      acao: 'recusar',
      motivo:
        `A chamada já registrou o aluno ${depois.length === 1 ? 'na aula de' : 'nas aulas de'} ${dias}. ` +
        `Escolha uma saída a partir de ${br(somarDias(ultima, 1))}.`,
    }
  }

  if (saida <= matricula.data_inicio) return { acao: 'excluir' }
  return { acao: 'encerrar', data_fim, status: data_fim < hoje ? 'Encerrada' : 'Ativa' }
}

/**
 * Caso Giovana (14/10/2026): a aluna ja estava matriculada a partir de 19/10 e
 * foi assistir a aula de 15/10. A gestora criou uma segunda matricula so para o
 * dia 15, e o nome apareceu duas vezes. O certo era antecipar o inicio da
 * matricula que ja existia. Ao criar uma matricula nova, devolve a matricula
 * futura do mesmo par (aluno, turma) que pode ser antecipada, para a tela
 * oferecer isso antes de gravar. A de reposicao fica de fora: ela e separada de
 * proposito, porque nao gera cobranca.
 */
export function matriculaParaAntecipar(
  nova: EntradaMatricula,
  jaMatriculado: PeriodoMatriculado[],
): PeriodoMatriculado | null {
  if (nova.id != null || nova.flag_reposicao || nova.data_inicio === '') return null

  const futuras = jaMatriculado
    .filter((m) => m.data_inicio > nova.data_inicio)
    .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
  const alvo = futuras[0]
  if (!alvo) return null

  // Antecipada, ela nao pode encostar em outra matricula (M1).
  const antecipada = { ...nova, id: alvo.id, data_inicio: nova.data_inicio, data_fim: alvo.data_fim }
  return seSobrepoe(antecipada, jaMatriculado) ? null : alvo
}

/**
 * Boas-vindas so para quem entra na turma (Operacionais 4.5). A reposicao ja
 * conhece a turma de origem, e a aula avulsa (matricula de um dia so, criada
 * pela tela da aula na agenda) e uma visita: a mensagem com os dias e horarios
 * da turma daria a entender que o aluno ficou matriculado.
 */
export function mandaBoasVindas(m: {
  flag_reposicao: boolean
  data_inicio: string
  data_fim: string | null
}): boolean {
  return !m.flag_reposicao && m.data_fim !== m.data_inicio
}
