import { describe, expect, it } from 'vitest'
import { creditoAoRealizar, decisaoAoMarcar, diferencaDaReposicao } from './credito-da-diferenca'

describe('diferencaDaReposicao', () => {
  it('destino mais barato: a diferenca', () => {
    expect(diferencaDaReposicao(15000, 10500)).toBe(4500)
  })

  it('mesmo preco ou mais caro: zero (o mais caro ja e cobrado na reposicao)', () => {
    expect(diferencaDaReposicao(10500, 10500)).toBe(0)
    expect(diferencaDaReposicao(10500, 15000)).toBe(0)
  })
})

describe('decisaoAoMarcar', () => {
  it('destino mais barato guarda a resposta da Kelly', () => {
    expect(decisaoAoMarcar(4500, true)).toBe(true)
    expect(decisaoAoMarcar(4500, false)).toBe(false)
  })

  it('sem diferenca nao ha o que decidir', () => {
    expect(decisaoAoMarcar(0, true)).toBeNull()
  })

  it('sem resposta (tela antiga) vale o sim, como na troca de servico', () => {
    expect(decisaoAoMarcar(4500, undefined)).toBe(true)
  })
})

describe('creditoAoRealizar', () => {
  const base = { decisao: true, jaTemCredito: false, valorOrigem: 15000, valorDestino: 10500 }

  it('presenca na reposicao mais barata, com o sim: credita a diferenca', () => {
    expect(creditoAoRealizar(base)).toBe(4500)
  })

  it('a Kelly disse nao, ou nao havia o que decidir: nada', () => {
    expect(creditoAoRealizar({ ...base, decisao: false })).toBe(0)
    expect(creditoAoRealizar({ ...base, decisao: null })).toBe(0)
  })

  it('chamada gravada de novo nao credita duas vezes', () => {
    expect(creditoAoRealizar({ ...base, jaTemCredito: true })).toBe(0)
  })

  it('o preco e o do dia: se a diferenca sumiu, nada', () => {
    expect(creditoAoRealizar({ ...base, valorDestino: 15000 })).toBe(0)
  })
})
