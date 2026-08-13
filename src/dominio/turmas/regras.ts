import type { Modalidade, StatusTurma } from '@/dominio/tipos'

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
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: StatusTurma
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

  if (turma.status === 'Ativa' && turma.dias_semana.length === 0) {
    erros.push('Escolha ao menos um dia da semana para ativar a turma.')
  }

  return erros
}
