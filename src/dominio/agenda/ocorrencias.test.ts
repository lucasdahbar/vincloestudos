import { describe, expect, it } from 'vitest'
import type { MatriculaDoEvento } from './evento-google'
import {
  ajustesDasOcorrencias,
  alunosDaSerie,
  alunosNaData,
  fimDoHorizonte,
  horariosPassadosDivergentes,
  inicioDoHorizonte,
  type OcorrenciaNoGoogle,
} from './ocorrencias'

const matricula = (over: Partial<MatriculaDoEvento> = {}): MatriculaDoEvento => ({
  nome: 'Ana Souza',
  status: 'Ativa',
  flag_reposicao: false,
  data_inicio: '2026-08-01',
  data_fim: null,
  ...over,
})

// O caso que motivou: turma de segunda; Bruno faz só a aula de 05/10.
const fixa = matricula({ nome: 'Ana Souza' })
const soHoje = matricula({ nome: 'Bruno Lima', data_inicio: '2026-10-05', data_fim: '2026-10-05' })

describe('alunosNaData', () => {
  it('lista quem está matriculado naquele dia', () => {
    expect(alunosNaData([fixa, soHoje], '2026-10-05')).toEqual(['Ana Souza', 'Bruno Lima'])
  })

  it('quem fez uma aula só não aparece na semana seguinte', () => {
    expect(alunosNaData([fixa, soHoje], '2026-10-12')).toEqual(['Ana Souza'])
  })

  it('quem ainda não começou não aparece', () => {
    const futura = matricula({ nome: 'Caio', data_inicio: '2026-10-19' })
    expect(alunosNaData([futura], '2026-10-12')).toEqual([])
    expect(alunosNaData([futura], '2026-10-19')).toEqual(['Caio'])
  })

  it('deixa de fora matrícula encerrada', () => {
    expect(alunosNaData([matricula({ status: 'Encerrada' })], '2026-10-05')).toEqual([])
  })

  it('quem repõe aparece só no dia da reposição, marcado', () => {
    // Correcao de 13/10/2026: o professor precisa saber que o aluno vem.
    const repondo = matricula({
      nome: 'Davi',
      flag_reposicao: true,
      data_inicio: '2026-10-05',
      data_fim: '2026-10-05',
    })
    expect(alunosNaData([fixa, repondo], '2026-10-05')).toEqual(['Ana Souza', 'Davi (reposição)'])
    expect(alunosNaData([fixa, repondo], '2026-10-12')).toEqual(['Ana Souza'])
  })

  it('ordena por nome, respeitando acento', () => {
    expect(
      alunosNaData([matricula({ nome: 'Bruno' }), matricula({ nome: 'Álvaro' })], '2026-10-05'),
    ).toEqual(['Álvaro', 'Bruno'])
  })
})

describe('alunosDaSerie', () => {
  it('a descrição geral da série só tem quem não tem data para sair', () => {
    // Quem tem data de fim aparece só nas ocorrências do período dele.
    expect(alunosDaSerie([fixa, soHoje])).toEqual(['Ana Souza'])
  })

  it('deixa de fora matrícula encerrada e de reposição', () => {
    expect(
      alunosDaSerie([matricula({ status: 'Encerrada' }), matricula({ flag_reposicao: true })]),
    ).toEqual([])
  })
})

describe('ajustesDasOcorrencias', () => {
  const descrever = (alunos: string[]) => `Alunos: ${alunos.join(', ') || 'nenhum'}`
  const ocorrencia = (data: string, descricao: string | null): OcorrenciaNoGoogle => ({
    id: `evt_${data.replaceAll('-', '')}`,
    data,
    descricao,
  })

  it('só a ocorrência do dia do aluno avulso ganha descrição própria', () => {
    const ocorrencias = [
      ocorrencia('2026-10-05', 'Alunos: Ana Souza'),
      ocorrencia('2026-10-12', 'Alunos: Ana Souza'),
      ocorrencia('2026-10-19', 'Alunos: Ana Souza'),
    ]
    expect(ajustesDasOcorrencias(ocorrencias, [fixa, soHoje], descrever)).toEqual([
      { id: 'evt_20261005', descricao: 'Alunos: Ana Souza, Bruno Lima' },
    ])
  })

  it('não mexe no que já está certo', () => {
    const ocorrencias = [ocorrencia('2026-10-05', 'Alunos: Ana Souza, Bruno Lima')]
    expect(ajustesDasOcorrencias(ocorrencias, [fixa, soHoje], descrever)).toEqual([])
  })

  it('desfaz a descrição própria quando o aluno avulso sai', () => {
    // A matrícula de 05/10 foi apagada: a ocorrência volta a ser igual às outras.
    const ocorrencias = [ocorrencia('2026-10-05', 'Alunos: Ana Souza, Bruno Lima')]
    expect(ajustesDasOcorrencias(ocorrencias, [fixa], descrever)).toEqual([
      { id: 'evt_20261005', descricao: 'Alunos: Ana Souza' },
    ])
  })
})

// Turma 31, 13/11/2026: o Miguel ganhou data de fim (12/11), saiu do texto geral
// da série, e as aulas de 29/10 e 05/11 ficaram "Nenhum aluno matriculado" no
// Google do professor, porque só se conferiam as ocorrências de hoje em diante.
describe('inicioDoHorizonte', () => {
  it('volta até a matrícula mais antiga, para as aulas passadas não herdarem a lista errada', () => {
    const miguel = matricula({ data_inicio: '2026-10-01', data_fim: '2026-11-12' })
    expect(inicioDoHorizonte([miguel, fixa], '2026-11-07')).toBe('2026-08-01')
    expect(inicioDoHorizonte([miguel], '2026-11-07')).toBe('2026-10-01')
  })

  it('nunca passa de hoje, e sem matrícula ativa é hoje', () => {
    expect(inicioDoHorizonte([matricula({ data_inicio: '2026-12-01' })], '2026-11-07')).toBe('2026-11-07')
    expect(inicioDoHorizonte([matricula({ status: 'Encerrada' })], '2026-11-07')).toBe('2026-11-07')
    expect(inicioDoHorizonte([], '2026-11-07')).toBe('2026-11-07')
  })

  it('com ele, a ocorrência passada é corrigida', () => {
    const miguel = matricula({ nome: 'Miguel', data_inicio: '2026-10-01', data_fim: '2026-11-12' })
    const passada: OcorrenciaNoGoogle = { id: 'o1', data: '2026-11-05', descricao: 'Nenhum aluno matriculado.' }
    expect(ajustesDasOcorrencias([passada], [miguel], (a) => a.join(','))).toEqual([{ id: 'o1', descricao: 'Miguel' }])
  })
})

describe('fimDoHorizonte', () => {
  it('olha um ano à frente', () => {
    expect(fimDoHorizonte([fixa], '2026-10-05')).toBe('2027-10-05')
  })

  it('vai além do ano quando uma matrícula muda depois disso', () => {
    // Senão a ocorrência daquele dia herdaria a lista errada da série.
    const longe = matricula({ data_inicio: '2027-12-01', data_fim: '2027-12-20' })
    expect(fimDoHorizonte([longe], '2026-10-05')).toBe('2027-12-27')
  })

  it('conta a data da reposição', () => {
    const repondo = matricula({
      flag_reposicao: true,
      data_inicio: '2027-12-20',
      data_fim: '2027-12-20',
    })
    expect(fimDoHorizonte([repondo], '2026-10-05')).toBe('2027-12-27')
  })
})

describe('quem avisou que não vem', () => {
  const avisou = matricula({ nome: 'Ana Souza', ausencias: ['2026-10-12'] })

  it('some só da ocorrência do aviso, continuando matriculado nas outras', () => {
    expect(alunosNaData([avisou], '2026-10-12')).toEqual([])
    expect(alunosNaData([avisou], '2026-10-05')).toEqual(['Ana Souza'])
    expect(alunosNaData([avisou], '2026-10-19')).toEqual(['Ana Souza'])
  })

  it('a ocorrência do aviso ganha descrição própria; as outras ficam como estão', () => {
    const descrever = (alunos: string[]) => `Alunos: ${alunos.join(', ') || 'nenhum'}`
    const ocorrencias = [
      { id: 'evt_20261005', data: '2026-10-05', descricao: 'Alunos: Ana Souza' },
      { id: 'evt_20261012', data: '2026-10-12', descricao: 'Alunos: Ana Souza' },
    ]
    expect(ajustesDasOcorrencias(ocorrencias, [avisou], descrever)).toEqual([
      { id: 'evt_20261012', descricao: 'Alunos: nenhum' },
    ])
  })

  it('o horizonte alcança um aviso além da última matrícula', () => {
    const longe = matricula({ ausencias: ['2028-03-06'] })
    expect(fimDoHorizonte([longe], '2026-10-14') >= '2028-03-06').toBe(true)
  })
})

// Bug de 31/10/2026: mudar o horário da série no Google muda também as
// ocorrências passadas (Biologia 2º ano: 19h viraram 16h no Google).
describe('horariosPassadosDivergentes', () => {
  const oc = (data: string, inicio: string, fim: string) => ({
    id: `ev_${data}`,
    data,
    descricao: null,
    inicio,
    fim,
  })

  it('devolve a ocorrência passada cujo horário não é o da aula no sistema', () => {
    const r = horariosPassadosDivergentes(
      [oc('2026-10-19', '16:00', '18:00'), oc('2026-10-26', '19:00', '20:00')],
      [
        { data: '2026-10-19', inicio: '19:00', fim: '20:00' },
        { data: '2026-10-26', inicio: '19:00', fim: '20:00' },
      ],
    )
    expect(r).toEqual([{ id: 'ev_2026-10-19', data: '2026-10-19', inicio: '19:00', fim: '20:00' }])
  })

  it('ignora a ocorrência sem aula correspondente ou sem horário lido', () => {
    const r = horariosPassadosDivergentes(
      [oc('2026-10-12', '16:00', '18:00'), { id: 'x', data: '2026-10-19', descricao: null }],
      [{ data: '2026-10-19', inicio: '19:00', fim: '20:00' }],
    )
    expect(r).toEqual([])
  })
})
