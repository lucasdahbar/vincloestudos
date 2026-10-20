import { describe, expect, it } from 'vitest'
import { planejarReposicao, validarDesistencia, type Pendencia, type AulaDestino } from './agendamento'

const pendencia: Pendencia = {
  id: 1,
  aluno_id: 10,
  aula_origem_id: 100,
  turma_origem_id: 50,
  status: 'Pendente',
}

const mesmaTurma: AulaDestino = { id: 101, turma_id: 50, status: 'Agendada', dia: '2026-10-19' }
const outraTurma: AulaDestino = { id: 200, turma_id: 60, status: 'Agendada', dia: '2026-10-19' }

/** A matricula regular do aluno na turma da falta, sem fim. */
const regular = { aluno_id: 10, turma_id: 50, data_inicio: '2026-10-01', data_fim: null }

describe('planejarReposicao', () => {
  it('na mesma turma, com a matricula valendo no dia, nao precisa de matricula nova', () => {
    const p = planejarReposicao(pendencia, mesmaTurma, [regular])
    expect(p.erros).toEqual([])
    expect(p.precisaMatricula).toBe(false)
  })

  it('caso Davi (17/10/2026): matricula antiga na turma de destino, que ja terminou, nao conta', () => {
    // Ele tinha uma matricula so de 05/10 na turma das 18h. Antes, qualquer
    // matricula Ativa contava: a reposicao ficava Agendada, sem matricula na
    // data, e ele nao aparecia na aula.
    const antiga = { aluno_id: 10, turma_id: 60, data_inicio: '2026-10-05', data_fim: '2026-10-05' }
    const p = planejarReposicao(pendencia, outraTurma, [antiga])
    expect(p.precisaMatricula).toBe(true)
  })

  it('matricula na turma de destino que so comeca depois da aula tambem nao conta', () => {
    const futura = { aluno_id: 10, turma_id: 60, data_inicio: '2026-11-01', data_fim: null }
    expect(planejarReposicao(pendencia, outraTurma, [futura]).precisaMatricula).toBe(true)
  })

  it('na mesma turma, se a matricula ja terminou no dia da reposicao, cria a de reposicao', () => {
    const encerrada = { ...regular, data_fim: '2026-10-10' }
    const p = planejarReposicao(pendencia, mesmaTurma, [encerrada])
    expect(p.precisaMatricula).toBe(true)
    expect(p.matricula).toEqual({ aluno_id: 10, turma_id: 50, flag_reposicao: true })
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
    const p = planejarReposicao(pendencia, outraTurma, [
      { aluno_id: 10, turma_id: 60, data_inicio: '2026-10-01', data_fim: '2026-10-19' },
    ])
    expect(p.precisaMatricula).toBe(false)
  })

  it('rejeita reposicao na propria aula da falta', () => {
    const p = planejarReposicao(pendencia, { ...mesmaTurma, id: 100 }, [])
    expect(p.erros).toContain('A reposição não pode ser na mesma aula em que houve a falta.')
  })

  it('rejeita aula de destino cancelada', () => {
    const p = planejarReposicao(pendencia, { ...mesmaTurma, status: 'Cancelada' }, [])
    expect(p.erros).toContain('Esta aula está cancelada. Escolha outra.')
  })

  it('rejeita aula de destino excluida', () => {
    const p = planejarReposicao(pendencia, { ...outraTurma, status: 'Excluída' }, [])
    expect(p.erros).toContain('Esta aula foi excluída. Escolha outra.')
    expect(p.precisaMatricula).toBe(false)
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
