import { describe, expect, it } from 'vitest'
import { planejarReposicao, validarDesistencia, type Pendencia, type AulaDestino } from './agendamento'

const pendencia: Pendencia = {
  id: 1,
  aluno_id: 10,
  aula_origem_id: 100,
  turma_origem_id: 50,
  status: 'Pendente',
}

const mesmaTurma: AulaDestino = { id: 101, turma_id: 50, status: 'Agendada' }
const outraTurma: AulaDestino = { id: 200, turma_id: 60, status: 'Agendada' }

describe('planejarReposicao', () => {
  it('na mesma turma, nao precisa de matricula nova', () => {
    const p = planejarReposicao(pendencia, mesmaTurma, [])
    expect(p.erros).toEqual([])
    expect(p.precisaMatricula).toBe(false)
  })

  it('em turma diferente, cria matricula de reposicao', () => {
    // Operacionais 5.4: a matricula existe so para permitir o registro de
    // presenca, e nao gera cobranca.
    const p = planejarReposicao(pendencia, outraTurma, [])
    expect(p.erros).toEqual([])
    expect(p.precisaMatricula).toBe(true)
    expect(p.matricula).toEqual({ aluno_id: 10, turma_id: 60, flag_reposicao: true })
  })

  it('nao duplica matricula se o aluno ja esta na turma de destino', () => {
    const p = planejarReposicao(pendencia, outraTurma, [{ aluno_id: 10, turma_id: 60 }])
    expect(p.precisaMatricula).toBe(false)
  })

  it('rejeita reposicao na propria aula da falta', () => {
    const p = planejarReposicao(pendencia, { id: 100, turma_id: 50, status: 'Agendada' }, [])
    expect(p.erros).toContain('A reposição não pode ser na mesma aula em que houve a falta.')
  })

  it('rejeita aula de destino cancelada', () => {
    const p = planejarReposicao(pendencia, { ...mesmaTurma, status: 'Cancelada' }, [])
    expect(p.erros).toContain('Esta aula está cancelada. Escolha outra.')
  })

  it('rejeita pendencia ja resolvida', () => {
    for (const status of ['Realizada', 'Desistida'] as const) {
      const p = planejarReposicao({ ...pendencia, status }, mesmaTurma, [])
      expect(p.erros).toContain('Esta reposição já foi encerrada.')
    }
  })

  it('permite reagendar uma reposicao ainda Agendada', () => {
    const p = planejarReposicao({ ...pendencia, status: 'Agendada' }, mesmaTurma, [])
    expect(p.erros).toEqual([])
  })

  it('a reposicao nunca gera cobranca', () => {
    // O aluno ja pagou pela aula original (Operacionais 5.4).
    const p = planejarReposicao(pendencia, outraTurma, [])
    expect(p.matricula?.flag_reposicao).toBe(true)
    expect(p.geraCobranca).toBe(false)
  })
})

describe('validarDesistencia', () => {
  it('aceita desistir de pendencia em aberto', () => {
    expect(validarDesistencia({ ...pendencia, status: 'Pendente' })).toEqual([])
    expect(validarDesistencia({ ...pendencia, status: 'Agendada' })).toEqual([])
  })

  it('rejeita desistir de reposicao ja realizada', () => {
    expect(validarDesistencia({ ...pendencia, status: 'Realizada' })).toContain(
      'Esta reposição já foi realizada.',
    )
  })
})
