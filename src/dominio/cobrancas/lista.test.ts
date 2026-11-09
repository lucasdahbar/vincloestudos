import { describe, expect, it } from 'vitest'
import {
  OPCOES_DE_RECEBIMENTOS,
  STATUS_EM_ABERTO,
  TODAS,
  listaDeCobrancas,
  rotuloDoStatus,
  statusDaTelaDeCobrancas,
  statusDaTelaDeRecebimentos,
} from './lista'

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

describe('filtro por status (pedido do Julio, 09/11/2026)', () => {
  const s = (id: number, status: string) => ({ ...c(id, `R${id}`), status })
  const lista = [
    s(1, 'Rascunho'),
    s(2, 'Confirmada'),
    s(3, 'Enviada'),
    s(4, 'Parcial'),
    s(5, 'Quitada'),
    s(6, 'Cancelada'),
  ]

  const ids = (status: readonly string[], busca?: string) =>
    listaDeCobrancas(lista, busca, status).map((x) => x.id)

  it('sem lista de status, traz todas', () => {
    expect(listaDeCobrancas(lista, undefined, undefined)).toHaveLength(6)
  })

  it('status e busca valem juntos', () => {
    expect(ids(['Confirmada', 'Parcial'], 'R2')).toEqual([2])
    expect(ids(['Quitada'], 'R2')).toEqual([])
  })

  // Separacao das telas (decisao do Julio, 09/11/2026): Cobrancas e o que
  // ainda nao foi mandado; Recebimentos, do envio em diante.
  describe('tela de Cobranças', () => {
    it('sem filtro: rascunhos e confirmadas ainda não enviadas', () => {
      expect(ids(statusDaTelaDeCobrancas(undefined))).toEqual([1, 2])
    })

    it('canceladas só aparecem no filtro', () => {
      expect(ids(statusDaTelaDeCobrancas('Cancelada'))).toEqual([6])
    })

    it('cada opção traz o seu status', () => {
      expect(ids(statusDaTelaDeCobrancas('Rascunho'))).toEqual([1])
      expect(ids(statusDaTelaDeCobrancas('Confirmada'))).toEqual([2])
    })
  })

  describe('tela de Recebimentos', () => {
    it('sem filtro: o que falta receber (em aberto e parcial)', () => {
      expect(ids(statusDaTelaDeRecebimentos(undefined))).toEqual([3, 4])
    })

    it('"Em aberto" é a enviada sem nada recebido', () => {
      expect(ids(statusDaTelaDeRecebimentos(STATUS_EM_ABERTO))).toEqual([3])
    })

    it('quitadas e "todas"', () => {
      expect(ids(statusDaTelaDeRecebimentos('Quitada'))).toEqual([5])
      expect(ids(statusDaTelaDeRecebimentos(TODAS))).toEqual([3, 4, 5])
    })

    it('rascunho, confirmada e cancelada nunca aparecem', () => {
      for (const o of OPCOES_DE_RECEBIMENTOS) {
        expect(ids(statusDaTelaDeRecebimentos(o))).not.toContain(1)
        expect(ids(statusDaTelaDeRecebimentos(o))).not.toContain(2)
        expect(ids(statusDaTelaDeRecebimentos(o))).not.toContain(6)
      }
    })
  })

  it('na tela, Enviada se chama "Em aberto"', () => {
    expect(rotuloDoStatus('Enviada')).toBe('Em aberto')
    expect(rotuloDoStatus('Parcial')).toBe('Parcial')
  })
})
