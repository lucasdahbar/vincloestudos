import { describe, expect, it } from 'vitest'
import { listaDeCobrancas } from './lista'

const c = (id: number, responsavel: string | null, alunos: string[] = []) => ({
  id,
  responsavel: responsavel === null ? null : { nome: responsavel },
  alunos,
})

describe('listaDeCobrancas', () => {
  it('ordena pelo nome do responsável, ignorando acento e maiúscula', () => {
    const lista = [c(1, 'Zélia'), c(2, 'ana'), c(3, 'Álvaro'), c(4, 'Bruno')]
    expect(listaDeCobrancas(lista).map((x) => x.id)).toEqual([3, 2, 4, 1])
  })

  it('cobranças do mesmo responsável ficam juntas, pela ordem de criação', () => {
    const lista = [c(9, 'Maria'), c(2, 'Ana'), c(5, 'Maria')]
    expect(listaDeCobrancas(lista).map((x) => x.id)).toEqual([2, 5, 9])
  })

  it('cobrança sem responsável vai para o fim', () => {
    const lista = [c(1, null), c(2, 'Bruno')]
    expect(listaDeCobrancas(lista).map((x) => x.id)).toEqual([2, 1])
  })

  it('a busca acha pelo responsável ou por qualquer aluno, sem acento', () => {
    const lista = [c(1, 'Maria Souza', ['João Souza']), c(2, 'Pedro Lima', ['Joana Lima']), c(3, 'Ana Reis', ['Caio'])]
    expect(listaDeCobrancas(lista, 'joao').map((x) => x.id)).toEqual([1])
    expect(listaDeCobrancas(lista, 'LIMA').map((x) => x.id)).toEqual([2])
    expect(listaDeCobrancas(lista, 'jo').map((x) => x.id)).toEqual([1, 2])
  })

  it('cada palavra da busca precisa aparecer, em qualquer nome', () => {
    const lista = [c(1, 'Maria Souza', ['João']), c(2, 'Maria Lima', ['Pedro'])]
    expect(listaDeCobrancas(lista, 'maria joão').map((x) => x.id)).toEqual([1])
    expect(listaDeCobrancas(lista, '  pedro  ').map((x) => x.id)).toEqual([2])
  })

  it('busca vazia devolve tudo', () => {
    const lista = [c(1, 'B'), c(2, 'A')]
    expect(listaDeCobrancas(lista, '   ').map((x) => x.id)).toEqual([2, 1])
    expect(listaDeCobrancas(lista, undefined)).toHaveLength(2)
  })

  it('não mexe na lista recebida', () => {
    const lista = [c(1, 'B'), c(2, 'A')]
    listaDeCobrancas(lista)
    expect(lista.map((x) => x.id)).toEqual([1, 2])
  })
})
