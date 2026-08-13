import { describe, expect, it } from 'vitest'
import { validarTurma, type EntradaTurma, type ServicoDaTurma } from './regras'

const servicoCompleto: ServicoDaTurma = {
  permite_materia: true,
  permite_escola: true,
}

const servicoSimples: ServicoDaTurma = {
  permite_materia: false,
  permite_escola: false,
}

const turmaValida: EntradaTurma = {
  servico_id: 1,
  materia_id: 2,
  escola_id: 3,
  ano_escolar_id: 4,
  professor_id: 5,
  modalidade: 'Presencial',
  dias_semana: [2, 4],
  horario_inicio: '15:00',
  horario_fim: '16:00',
  status: 'Ativa',
}

describe('validarTurma', () => {
  it('aceita uma turma completa e valida', () => {
    expect(validarTurma(turmaValida, servicoCompleto)).toEqual([])
  })

  it('exige materia quando o servico permite materia', () => {
    const erros = validarTurma({ ...turmaValida, materia_id: null }, servicoCompleto)
    expect(erros).toContain('Selecione a matéria: o serviço escolhido exige esse campo.')
  })

  it('exige escola quando o servico permite escola', () => {
    const erros = validarTurma({ ...turmaValida, escola_id: null }, servicoCompleto)
    expect(erros).toContain('Selecione a escola: o serviço escolhido exige esse campo.')
  })

  it('rejeita materia e escola quando o servico nao os permite', () => {
    const erros = validarTurma(turmaValida, servicoSimples)
    expect(erros).toContain('O serviço escolhido não usa matéria.')
    expect(erros).toContain('O serviço escolhido não usa escola.')
  })

  it('aceita turma sem materia nem escola quando o servico nao os permite', () => {
    const erros = validarTurma(
      { ...turmaValida, materia_id: null, escola_id: null },
      servicoSimples,
    )
    expect(erros).toEqual([])
  })

  it('exige horario final maior que o inicial', () => {
    const erros = validarTurma(
      { ...turmaValida, horario_inicio: '16:00', horario_fim: '15:00' },
      servicoCompleto,
    )
    expect(erros).toContain('O horário de término deve ser maior que o de início.')
  })

  it('rejeita horarios iguais', () => {
    const erros = validarTurma(
      { ...turmaValida, horario_inicio: '15:00', horario_fim: '15:00' },
      servicoCompleto,
    )
    expect(erros).toContain('O horário de término deve ser maior que o de início.')
  })

  it('so permite turma Ativa com ao menos um dia da semana', () => {
    const erros = validarTurma({ ...turmaValida, dias_semana: [] }, servicoCompleto)
    expect(erros).toContain('Escolha ao menos um dia da semana para ativar a turma.')
  })

  it('permite turma Encerrada sem dia da semana', () => {
    const erros = validarTurma(
      { ...turmaValida, dias_semana: [], status: 'Encerrada' },
      servicoCompleto,
    )
    expect(erros).toEqual([])
  })

  it('rejeita dia da semana fora do intervalo 0 a 6', () => {
    const erros = validarTurma({ ...turmaValida, dias_semana: [2, 9] }, servicoCompleto)
    expect(erros).toContain('Dia da semana inválido.')
  })
})
