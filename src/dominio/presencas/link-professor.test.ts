import { describe, expect, it } from 'vitest'
import {
  aulasAcessiveis,
  podeAbrir,
  telaDoLink,
  type AulaDoProfessor,
} from './link-professor'

const aula = (over: Partial<AulaDoProfessor> = {}): AulaDoProfessor => ({
  id: 1,
  data: '2026-09-02',
  horario_inicio: '15:00',
  horario_fim: '16:00',
  turma_nome: 'Matemática · 9º ano',
  ja_registrada: false,
  ...over,
})

/** Relogio local, no mesmo fuso em que a aula acontece. */
const as = (hhmm: string, dia = '2026-09-02') => {
  const [ano, mes, d] = dia.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(ano, mes - 1, d, h, m)
}

describe('aulasAcessiveis', () => {
  it('abre a aula durante o horário dela', () => {
    expect(aulasAcessiveis([aula()], as('15:30'))).toHaveLength(1)
  })

  it('abre uma hora antes de começar', () => {
    expect(aulasAcessiveis([aula()], as('14:05'))).toHaveLength(1)
  })

  it('ainda não abre duas horas antes', () => {
    expect(aulasAcessiveis([aula()], as('13:00'))).toEqual([])
  })

  it('continua aberta no fim do dia, para quem só lembra depois', () => {
    expect(aulasAcessiveis([aula()], as('21:00'))).toHaveLength(1)
  })

  it('fecha depois da janela', () => {
    expect(aulasAcessiveis([aula()], as('23:00'))).toEqual([])
  })

  it('não abre a aula de amanhã', () => {
    expect(aulasAcessiveis([aula({ data: '2026-09-03' })], as('15:00'))).toEqual([])
  })

  it('não abre a aula da semana passada', () => {
    expect(aulasAcessiveis([aula({ data: '2026-08-26' })], as('15:00'))).toEqual([])
  })

  it('ordena da mais próxima do horário atual para a mais distante', () => {
    const agenda = [
      aula({ id: 1, horario_inicio: '15:00', horario_fim: '16:00' }),
      aula({ id: 2, horario_inicio: '17:00', horario_fim: '18:00' }),
    ]
    expect(aulasAcessiveis(agenda, as('16:45')).map((a) => a.id)).toEqual([2, 1])
  })

  it('desempata pelo nome da turma, para a lista não dançar a cada carregamento', () => {
    const agenda = [
      aula({ id: 1, turma_nome: 'Química · 2ª série' }),
      aula({ id: 2, turma_nome: 'Física · 1ª série' }),
    ]
    expect(aulasAcessiveis(agenda, as('15:30')).map((a) => a.id)).toEqual([2, 1])
  })

  it('a aula já registrada continua visível — a trava é na hora de gravar', () => {
    expect(aulasAcessiveis([aula({ ja_registrada: true })], as('15:30'))).toHaveLength(1)
  })
})

describe('telaDoLink', () => {
  it('sem aula na janela, avisa que não há nada agora', () => {
    expect(telaDoLink([aula({ data: '2026-10-01' })], as('15:00'))).toEqual({ tipo: 'nenhuma' })
  })

  it('uma aula só abre direto a chamada', () => {
    const tela = telaDoLink([aula()], as('15:30'))
    expect(tela.tipo).toBe('uma')
  })

  it('duas aulas no mesmo horário viram lista de escolha', () => {
    const agenda = [aula({ id: 1, turma_nome: 'A' }), aula({ id: 2, turma_nome: 'B' })]
    const tela = telaDoLink(agenda, as('15:30'))
    expect(tela).toMatchObject({ tipo: 'escolher' })
    expect(tela.tipo === 'escolher' && tela.aulas).toHaveLength(2)
  })
})

describe('podeAbrir', () => {
  // A tela filtra, mas quem grava tem de conferir de novo: o professor pode
  // deixar a pagina aberta e so salvar horas depois.
  it('confirma a aula dentro da janela', () => {
    expect(podeAbrir(aula(), as('15:30'))).toBe(true)
  })

  it('recusa a aula fora da janela', () => {
    expect(podeAbrir(aula(), as('23:59'))).toBe(false)
  })
})
