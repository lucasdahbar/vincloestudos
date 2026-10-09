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
  tipo_recorrencia: 'Recorrente',
  data_unica: null,
  frequencia: 'Semanal',
  intervalo: 1,
  data_inicio: '2026-10-01',
  data_fim: null,
  dias_semana: [2, 4],
  horario_inicio: '15:00',
  horario_fim: '16:00',
  status: 'Ativa',
  link_videochamada: null,
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

describe('validarTurma — regra e período (Rodada 4)', () => {
  it('exige data de início na recorrente', () => {
    expect(validarTurma({ ...turmaValida, data_inicio: null }, servicoCompleto)).toContain(
      'Informe quando a turma começa.',
    )
  })

  it('fim não pode ser antes do início', () => {
    expect(
      validarTurma({ ...turmaValida, data_fim: '2026-09-30' }, servicoCompleto),
    ).toContain('A data de término não pode ser antes da data de início.')
  })

  it('fim vazio é aceito: o sistema usa 31/12', () => {
    expect(validarTurma({ ...turmaValida, data_fim: null }, servicoCompleto)).toEqual([])
  })

  it('intervalo de 1 a 99', () => {
    const msg = 'O intervalo da repetição deve ser um número de 1 a 99.'
    expect(validarTurma({ ...turmaValida, intervalo: 0 }, servicoCompleto)).toContain(msg)
    expect(validarTurma({ ...turmaValida, intervalo: 100 }, servicoCompleto)).toContain(msg)
    expect(validarTurma({ ...turmaValida, intervalo: 1.5 }, servicoCompleto)).toContain(msg)
  })

  it('mensal e diária não usam dia da semana', () => {
    expect(
      validarTurma({ ...turmaValida, frequencia: 'Mensal', dias_semana: [2] }, servicoCompleto),
    ).toContain('Dias da semana só valem para repetição semanal.')
    expect(
      validarTurma({ ...turmaValida, frequencia: 'Mensal', dias_semana: [] }, servicoCompleto),
    ).toEqual([])
  })

  it('aula única ignora os campos da recorrente', () => {
    expect(
      validarTurma(
        {
          ...turmaValida,
          tipo_recorrencia: 'Único',
          data_unica: '2026-11-15',
          dias_semana: [],
          data_inicio: null,
        },
        servicoCompleto,
      ),
    ).toEqual([])
  })
})
