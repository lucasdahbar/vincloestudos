import type { Frequencia, Modalidade, StatusTurma, TipoRecorrencia } from '@/dominio/tipos'

export interface ServicoDaTurma {
  permite_materia: boolean
  permite_escola: boolean
}

export interface EntradaTurma {
  servico_id: number | null
  materia_id: number | null
  escola_id: number | null
  ano_escolar_id: number | null
  professor_id: number | null
  modalidade: Modalidade | null
  /** T1: "Não se repete" (data_unica) ou "Recorrente" (dias da semana). */
  tipo_recorrencia: TipoRecorrencia
  /** Preenchido so no modo Único. Data em ISO (AAAA-MM-DD). */
  data_unica: string | null
  /** Rodada 4: só na Recorrente. */
  frequencia: Frequencia | null
  /** "A cada N". Só na Recorrente. */
  intervalo: number | null
  /** ISO. Só na Recorrente; pode ser no passado. */
  data_inicio: string | null
  /** ISO. Vazio = o sistema usa 31/12 (fim automático). */
  data_fim: string | null
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: StatusTurma
  /**
   * Link do Google Meet. Colado a mao ate G2 (criacao automatica do evento)
   * entrar; depois o proprio sistema preenche.
   */
  link_videochamada: string | null
}

/**
 * Adendo v1.1, secao 5.1 e 5.2. As mensagens sao escritas para a gestora,
 * nao para o desenvolvedor: dizem o que fazer, nao o que falhou.
 */
export function validarTurma(turma: EntradaTurma, servico: ServicoDaTurma): string[] {
  const erros: string[] = []

  if (turma.servico_id === null) erros.push('Selecione o serviço.')
  if (turma.ano_escolar_id === null) erros.push('Selecione o ano escolar.')
  if (turma.professor_id === null) erros.push('Selecione o professor responsável.')
  if (turma.modalidade === null) erros.push('Selecione a modalidade.')

  if (servico.permite_materia && turma.materia_id === null) {
    erros.push('Selecione a matéria: o serviço escolhido exige esse campo.')
  }
  if (!servico.permite_materia && turma.materia_id !== null) {
    erros.push('O serviço escolhido não usa matéria.')
  }

  if (servico.permite_escola && turma.escola_id === null) {
    erros.push('Selecione a escola: o serviço escolhido exige esse campo.')
  }
  if (!servico.permite_escola && turma.escola_id !== null) {
    erros.push('O serviço escolhido não usa escola.')
  }

  if (turma.horario_fim <= turma.horario_inicio) {
    erros.push('O horário de término deve ser maior que o de início.')
  }

  if (turma.dias_semana.some((dia) => !Number.isInteger(dia) || dia < 0 || dia > 6)) {
    erros.push('Dia da semana inválido.')
  }

  // T1: os dois modos sao excludentes. No modo Único a turma acontece uma vez
  // so (um aulao de revisao, por exemplo) e nao ha dia da semana que se repita.
  if (turma.tipo_recorrencia === 'Único') {
    if (!turma.data_unica) erros.push('Informe a data da aula.')
    if (turma.dias_semana.length > 0) {
      erros.push('Uma aula que não se repete não tem dias da semana.')
    }
  } else {
    if (turma.data_unica) {
      erros.push('A data única só vale para uma aula que não se repete.')
    }
    if (!turma.data_inicio) erros.push('Informe quando a turma começa.')
    if (turma.data_inicio && turma.data_fim && turma.data_fim < turma.data_inicio) {
      erros.push('A data de término não pode ser antes da data de início.')
    }
    if (turma.frequencia === null) erros.push('Escolha de quanto em quanto a turma se repete.')
    if (
      turma.intervalo === null ||
      !Number.isInteger(turma.intervalo) ||
      turma.intervalo < 1 ||
      turma.intervalo > 99
    ) {
      erros.push('O intervalo da repetição deve ser um número de 1 a 99.')
    }
    if (turma.frequencia === 'Semanal') {
      if (turma.status === 'Ativa' && turma.dias_semana.length === 0) {
        erros.push('Escolha ao menos um dia da semana para ativar a turma.')
      }
    } else if (turma.dias_semana.length > 0) {
      erros.push('Dias da semana só valem para repetição semanal.')
    }
  }

  return erros
}
