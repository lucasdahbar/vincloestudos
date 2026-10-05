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

  it('deixa de fora matrícula encerrada e de reposição', () => {
    expect(
      alunosNaData(
        [matricula({ status: 'Encerrada' }), matricula({ flag_reposicao: true })],
        '2026-10-05',
      ),
    ).toEqual([])
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
})
