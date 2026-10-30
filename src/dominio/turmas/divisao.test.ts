import { describe, expect, it } from 'vitest'
import type { AulaVarrida, Varredura } from '@/dominio/agenda/varredura'
import {
  novaDataNaRegra,
  planoDeDivisao,
  type AulaDaDivisao,
  type MudancaDaSerie,
  type TurmaDaDivisao,
} from './divisao'

// Marco de 2031: as segundas sao 03, 10, 17, 24 e 31; as quintas, 06, 13, 20 e 27.
const turma: TurmaDaDivisao = {
  tipo_recorrencia: 'Recorrente',
  status: 'Ativa',
  data_inicio: '2031-03-03',
  data_fim: '2031-04-30',
  dias_semana: [1],
  horario_inicio: '10:00',
  horario_fim: '11:00',
  professor_id: 9,
  servico_id: 3,
  modalidade: 'Presencial',
}

const aula = (id: number, data: string, over: Partial<AulaDaDivisao> = {}): AulaDaDivisao => ({
  id,
  data,
  inicio: `${data}T10:00`,
  fim: `${data}T11:00`,
  original: null,
  status: 'Agendada',
  professor_id: 9,
  servico_id: 3,
  modalidade: 'Presencial',
  ...over,
})

const aulas = [
  aula(1, '2031-03-03'),
  aula(2, '2031-03-10'),
  aula(3, '2031-03-17'),
  aula(4, '2031-03-24'),
  aula(5, '2031-03-31'),
]

/** A varredura de editar: toda aula muda, menos as `fica` informadas. */
function varredura(
  campos: AulaVarrida['campos'],
  lista: AulaDaDivisao[] = aulas,
  fica: Record<number, string> = {},
  escolha: number[] = [],
): Varredura {
  const varridas: AulaVarrida[] = lista
    .filter((a) => a.status !== 'Excluída')
    .map((a) => ({
      id: a.id,
      data: a.data,
      inicio: a.inicio,
      situacao: 'Confirmada',
      grupo: escolha.includes(a.id) ? 'escolha' : fica[a.id] ? 'fica' : 'muda',
      motivo: fica[a.id],
      alunos: [],
      avisos: [],
      campos: fica[a.id] ? {} : campos,
    }))
  return {
    acao: 'editar',
    aulas: varridas,
    mudam: varridas.filter((a) => a.grupo === 'muda').length,
    escolhas: varridas.filter((a) => a.grupo === 'escolha').length,
    ficam: varridas.filter((a) => a.grupo === 'fica').length,
    avisar: [],
  }
}

const paraQuinta: MudancaDaSerie = {
  quando: { dias_semana: [4], horario_inicio: '14:00', horario_fim: '15:00' },
}

const opcoes = { escopo: 'a-partir' as const, aPartirDe: '2031-03-10', puladas: new Set<string>() }

describe('novaDataNaRegra', () => {
  it('leva cada aula ao dia novo na mesma semana, contada a partir do corte', () => {
    expect(novaDataNaRegra('2031-03-10', '2031-03-10', [1], [4])).toBe('2031-03-13')
    expect(novaDataNaRegra('2031-03-17', '2031-03-10', [1], [4])).toBe('2031-03-20')
  })

  it('a primeira aula da regra nova pode vir antes da antiga, nunca antes do corte', () => {
    // A partir de quarta 05/03: a quinta 06 e a primeira aula nova, e a
    // segunda 10 (a primeira antiga depois do corte) vai para ela.
    expect(novaDataNaRegra('2031-03-10', '2031-03-05', [1], [4])).toBe('2031-03-06')
  })

  it('com dois dias, pareia pela ordem dentro da semana', () => {
    expect(novaDataNaRegra('2031-03-03', '2031-03-03', [1, 3], [2, 4])).toBe('2031-03-04')
    expect(novaDataNaRegra('2031-03-05', '2031-03-03', [1, 3], [2, 4])).toBe('2031-03-06')
  })

  it('data fora da regra antiga fica onde está', () => {
    expect(novaDataNaRegra('2031-03-11', '2031-03-10', [1], [4])).toBe('2031-03-11')
  })
})

describe('planoDeDivisao: dia e horário a partir de uma data', () => {
  const p = planoDeDivisao(turma, aulas, varredura({ quando: true }), paraQuinta, opcoes)

  it('divide na data pedida, porque há aula antes dela', () => {
    expect(p.erros).toEqual([])
    expect(p.corte).toBe('2031-03-10')
    expect(p.novaTurma).toBe(true)
  })

  it('leva as aulas a partir da data para a quinta, no horário novo', () => {
    expect(p.aulas.map((a) => [a.id, a.inicio, a.fim])).toEqual([
      [2, '2031-03-13T14:00', '2031-03-13T15:00'],
      [3, '2031-03-20T14:00', '2031-03-20T15:00'],
      [4, '2031-03-27T14:00', '2031-03-27T15:00'],
      [5, '2031-04-03T14:00', '2031-04-03T15:00'],
    ])
  })

  it('a aula de antes da data fica na turma antiga', () => {
    expect(p.aulas.some((a) => a.id === 1)).toBe(false)
  })

  it('aula remarcada continua no dia escolhido; muda só o dia de origem', () => {
    const remarcada = aula(3, '2031-03-17', { inicio: '2031-03-18T09:00', fim: '2031-03-18T10:00', original: '2031-03-17T10:00' })
    const lista = aulas.map((a) => (a.id === 3 ? remarcada : a))
    const r = planoDeDivisao(turma, lista, varredura({ quando: true }, lista), paraQuinta, opcoes)
    expect(r.aulas.find((a) => a.id === 3)).toMatchObject({
      inicio: '2031-03-18T09:00',
      fim: '2031-03-18T10:00',
      original: '2031-03-20T14:00',
    })
  })

  it('aula excluída vai junto, para a semana dela continuar sem aula', () => {
    const lista = aulas.map((a) => (a.id === 4 ? { ...a, status: 'Excluída' as const } : a))
    const r = planoDeDivisao(turma, lista, varredura({ quando: true }, lista), paraQuinta, opcoes)
    expect(r.aulas.find((a) => a.id === 4)?.inicio).toBe('2031-03-27T14:00')
  })

  it('aula cancelada também vai junto (revisão de 30/10)', () => {
    const lista = aulas.map((a) => (a.id === 4 ? { ...a, status: 'Cancelada' as const } : a))
    const r = planoDeDivisao(turma, lista, varredura({ quando: true }, lista.filter((a) => a.id !== 4)), paraQuinta, opcoes)
    expect(r.aulas.find((a) => a.id === 4)?.inicio).toBe('2031-03-27T14:00')
  })

  it('aula de feriado fica: o dia novo daquela semana pode ter aula', () => {
    const lista = aulas.map((a) => (a.id === 4 ? { ...a, status: 'Feriado' as const } : a))
    const r = planoDeDivisao(turma, lista, varredura({ quando: true }, lista.filter((a) => a.id !== 4)), paraQuinta, opcoes)
    expect(r.aulas.find((a) => a.id === 4)?.inicio).toBe('2031-03-24T10:00')
  })

  it('dia novo em feriado: a aula fica no dia de sempre, como remarcada, e a prévia avisa', () => {
    const r = planoDeDivisao(turma, aulas, varredura({ quando: true }), paraQuinta, {
      ...opcoes,
      puladas: new Set(['2031-03-20']),
    })
    expect(r.erros).toEqual([])
    expect(r.aulas.find((a) => a.id === 3)).toMatchObject({
      inicio: '2031-03-17T10:00',
      original: '2031-03-20T14:00',
    })
    expect(r.avisos).toContain(
      '20/03 é feriado ou recesso: a aula de 17/03 continua em 17/03 às 10:00. Exclua-a se não houver aula.',
    )
  })

  it('a partir do começo da turma, sem aula antes: muda a própria turma', () => {
    const r = planoDeDivisao(turma, aulas, varredura({ quando: true }), paraQuinta, {
      ...opcoes,
      aPartirDe: '2031-03-01',
    })
    expect(r.corte).toBe('2031-03-03')
    expect(r.novaTurma).toBe(false)
    expect(r.aulas[0]).toMatchObject({ id: 1, inicio: '2031-03-06T14:00' })
  })
})

describe('planoDeDivisao: professor e serviço', () => {
  it('troca o professor das aulas que seguiam a turma; o substituto fica', () => {
    const lista = aulas.map((a) => (a.id === 3 ? { ...a, professor_id: 18 } : a))
    const r = planoDeDivisao(turma, lista, varredura({ professor: true }, lista), { professor_id: 20 }, opcoes)
    expect(r.aulas.map((a) => [a.id, a.professor_id])).toEqual([
      [2, 20],
      [3, 18],
      [4, 20],
      [5, 20],
    ])
    expect(r.aulas[0].inicio).toBe('2031-03-10T10:00')
  })

  it('aula que fica vai para a turma nova com o que já tinha', () => {
    const r = planoDeDivisao(
      turma,
      aulas,
      varredura({ servico: true }, aulas, { 3: 'O serviço fica: a aula já foi cobrada.' }),
      { servico_id: 6 },
      opcoes,
    )
    expect(r.erros).toEqual([])
    expect(r.aulas.map((a) => [a.id, a.servico_id])).toEqual([
      [2, 6],
      [3, 3],
      [4, 6],
      [5, 6],
    ])
  })

  it('série inteira começa na primeira aula que muda', () => {
    const r = planoDeDivisao(
      turma,
      aulas,
      varredura({ professor: true }, aulas, { 1: 'Esta aula já aconteceu.' }),
      { professor_id: 20 },
      { ...opcoes, escopo: 'serie', aPartirDe: '2031-03-03' },
    )
    expect(r.corte).toBe('2031-03-10')
    expect(r.novaTurma).toBe(true)
  })

  it('série inteira sem nada que fique: muda a própria turma', () => {
    const r = planoDeDivisao(turma, aulas, varredura({ professor: true }), { professor_id: 20 }, {
      ...opcoes,
      escopo: 'serie',
      aPartirDe: '2031-03-03',
    })
    expect(r.corte).toBe('2031-03-03')
    expect(r.novaTurma).toBe(false)
  })
})

describe('planoDeDivisao: trocar a modalidade', () => {
  it('toda aula do corte em diante recebe a modalidade nova', () => {
    const r = planoDeDivisao(turma, aulas, varredura({ modalidade: true }), { modalidade_nova: 'Online' }, opcoes)
    expect(r.erros).toEqual([])
    expect(r.aulas.every((a) => a.modalidade === 'Online')).toBe(true)
  })

  it('aula com substituta de modalidade fica com ela', () => {
    // Confere o resultado correto do sistema: turma Presencial, mudanca
    // pede Online, aula 3 ja estava em Online por conta propria (igual a
    // "aula substituta" do teste de professor_id) e continua em Online.
    //
    // Limitacao conhecida: com um enum de so 2 valores, e matematicamente
    // impossivel provar por resultado observavel que a condicao de
    // override (`a.modalidade === turma.modalidade`, em divisao.ts) de
    // fato resiste - toda mudanca valida (errosDaMudanca recusa
    // modalidade_nova igual a turma.modalidade) tem um unico valor
    // possivel, que e sempre o mesmo que uma aula substituta ja teria. O
    // teste de professor_id evita isso usando um terceiro valor (18
    // substituto, 20 mudanca, 9 turma). Aqui a condicao existe por
    // consistencia com o padrao de professor_id/servico_id, mas este
    // teste nao a isola - confirmado removendo a condicao do codigo e
    // vendo o teste continuar passando por coincidencia.
    const lista = aulas.map((a) => (a.id === 3 ? { ...a, modalidade: 'Online' as const } : a))
    const r = planoDeDivisao(turma, lista, varredura({ modalidade: true }, lista), { modalidade_nova: 'Online' }, opcoes)
    expect(r.aulas.find((a) => a.id === 3)?.modalidade).toBe('Online')
    expect(r.aulas.find((a) => a.id === 4)?.modalidade).toBe('Online')
  })
})

describe('planoDeDivisao: o que impede', () => {
  const erros = (...args: Parameters<typeof planoDeDivisao>) => planoDeDivisao(...args).erros

  it('turma de aula única', () => {
    expect(erros({ ...turma, tipo_recorrencia: 'Único' }, aulas, varredura({ quando: true }), paraQuinta, opcoes)).toEqual([
      'Turma de aula única: mude a aula pelo "Só esta aula".',
    ])
  })

  it('outro número de aulas por semana', () => {
    expect(
      erros(turma, aulas, varredura({ quando: true }), { quando: { ...paraQuinta.quando!, dias_semana: [2, 4] } }, opcoes),
    ).toEqual(['Para mudar quantas aulas há por semana, encerre esta turma e crie outra.'])
  })

  it('horário de fim antes do início', () => {
    expect(
      erros(turma, aulas, varredura({ quando: true }), { quando: { dias_semana: [4], horario_inicio: '15:00', horario_fim: '14:00' } }, opcoes),
    ).toEqual(['O horário de fim tem de ser depois do início.'])
  })

  it('regra igual à de hoje', () => {
    expect(erros(turma, aulas, varredura({ professor: true }), { professor_id: 9 }, opcoes)).toEqual([
      'A regra nova é igual à de hoje.',
    ])
  })

  it('pergunta sem resposta', () => {
    expect(erros(turma, aulas, varredura({ quando: true }, aulas, {}, [2]), paraQuinta, opcoes)).toEqual([
      'Falta responder em 1 aula: responda antes de aplicar.',
    ])
  })

  it('dia e horário com uma aula que fica depois da data', () => {
    expect(
      erros(turma, aulas, varredura({ quando: true }, aulas, { 3: 'Esta aula já aconteceu.' }), paraQuinta, opcoes),
    ).toEqual(['A aula de 17/03 fica como está (Esta aula já aconteceu.). Mude a partir do dia seguinte a ela.'])
  })

  it('data depois do fim da turma', () => {
    expect(erros(turma, aulas, varredura({ quando: true }), paraQuinta, { ...opcoes, aPartirDe: '2031-05-05' })).toEqual([
      'A turma termina em 30/04: escolha uma data até lá.',
    ])
  })

  it('aula que iria para depois do fim da turma', () => {
    expect(
      erros({ ...turma, data_fim: '2031-03-31' }, aulas, varredura({ quando: true }), paraQuinta, opcoes),
    ).toEqual(['A aula de 31/03 iria para 03/04, depois do fim da turma (31/03).'])
  })

  it('duas aulas no mesmo dia', () => {
    const lista = [...aulas, aula(6, '2031-03-13', { status: 'Feriado' })]
    expect(erros(turma, lista, varredura({ quando: true }, lista.filter((a) => a.id !== 6)), paraQuinta, opcoes)).toEqual([
      'Duas aulas cairiam em 13/03.',
    ])
  })
})
