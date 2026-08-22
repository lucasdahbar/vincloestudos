import { describe, expect, it, vi } from 'vitest'
import { buscarCep, normalizarCep } from './cep'

const resposta = (corpo: unknown, ok = true) =>
  ({ ok, json: async () => corpo }) as Response

describe('buscarCep', () => {
  it('devolve o endereço quando o CEP existe', async () => {
    const r = await buscarCep('36570-000', async () =>
      resposta({ logradouro: 'Rua Teste', bairro: 'Centro', localidade: 'Viçosa', uf: 'mg' }),
    )
    expect(r).toEqual({
      ok: true,
      endereco: { endereco: 'Rua Teste', bairro: 'Centro', cidade: 'Viçosa', estado: 'MG' },
    })
  })

  it('trata o CEP inexistente, que o ViaCEP devolve como 200 com erro', async () => {
    const r = await buscarCep('00000-000', async () => resposta({ erro: true }))
    expect(r).toEqual({ ok: false, motivo: 'CEP não encontrado. Confira o número ou preencha à mão.' })
  })

  it('recusa CEP incompleto sem nem chamar a API', async () => {
    const chamou = vi.fn()
    const r = await buscarCep('3657', chamou)
    expect(chamou).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: false, motivo: 'O CEP precisa ter 8 dígitos.' })
  })

  it('libera o preenchimento manual quando a consulta estoura o tempo', async () => {
    const r = await buscarCep('36570-000', async () => {
      const e = new Error('abortado')
      e.name = 'AbortError'
      throw e
    })
    expect(r).toEqual({ ok: false, motivo: 'A consulta de CEP demorou demais. Preencha o endereço à mão.' })
  })

  it('libera o preenchimento manual quando a API cai', async () => {
    const r = await buscarCep('36570-000', async () => {
      throw new Error('rede fora')
    })
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ motivo: expect.stringContaining('à mão') })
  })

  it('tolera resposta sem alguns campos', async () => {
    const r = await buscarCep('36570-000', async () => resposta({ localidade: 'Viçosa', uf: 'MG' }))
    expect(r).toEqual({
      ok: true,
      endereco: { endereco: '', bairro: '', cidade: 'Viçosa', estado: 'MG' },
    })
  })
})

describe('normalizarCep', () => {
  it('tira a formatação', () => {
    expect(normalizarCep('36570-000')).toBe('36570000')
  })
})
