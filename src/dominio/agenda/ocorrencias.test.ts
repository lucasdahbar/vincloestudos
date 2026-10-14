import { describe, expect, it } from 'vitest'
import type { MatriculaDoEvento } from './evento-google'
import {
  ajustesDasOcorrencias,
  alunosDaSerie,
  alunosNaData,
  fimDoHorizonte,
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
