import { describe, expect, it } from 'vitest'
import {
  cepValido,
  cnpjValido,
  cpfValido,
  mascaraCep,
  mascaraCnpj,
  mascaraCpf,
  mascaraTelefone,
  somenteDigitos,
} from './formato'

describe('mascaraCpf', () => {
  it('formata enquanto se digita', () => {
    expect(mascaraCpf('529')).toBe('529')
    expect(mascaraCpf('529982')).toBe('529.982')
    expect(mascaraCpf('529982247')).toBe('529.982.247')
    expect(mascaraCpf('52998224725')).toBe('529.982.247-25')
  })
  it('ignora o que nao e digito', () => {
    expect(mascaraCpf('529.982.247-25')).toBe('529.982.247-25')
    expect(mascaraCpf('abc529xyz982')).toBe('529.982')
  })
  it('nao passa de 11 digitos', () => {
    expect(mascaraCpf('529982247259999')).toBe('529.982.247-25')
  })
  it('devolve vazio para entrada vazia', () => {
    expect(mascaraCpf('')).toBe('')
  })
})

describe('cpfValido — digito verificador mod 11', () => {
  it('aceita CPF valido', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('11144477735')).toBe(true)
  })
  it('rejeita digito verificador errado', () => {
    expect(cpfValido('529.982.247-24')).toBe(false)
    expect(cpfValido('11144477734')).toBe(false)
  })
  it('rejeita todos os digitos iguais', () => {
    // 111.111.111-11 passa na conta mas nunca e um CPF real.
    expect(cpfValido('11111111111')).toBe(false)
    expect(cpfValido('00000000000')).toBe(false)
  })
  it('rejeita quantidade errada de digitos', () => {
    expect(cpfValido('5299822472')).toBe(false)
    expect(cpfValido('')).toBe(false)
  })
})

describe('mascaraCnpj e cnpjValido', () => {
  it('formata enquanto se digita', () => {
    expect(mascaraCnpj('11222333')).toBe('11.222.333')
    expect(mascaraCnpj('11222333000181')).toBe('11.222.333/0001-81')
  })
  it('aceita CNPJ valido', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
  })
  it('rejeita digito errado e digitos repetidos', () => {
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
  })
})

describe('mascaraTelefone', () => {
  it('formata celular de 11 digitos', () => {
    expect(mascaraTelefone('32984926111')).toBe('(32) 98492-6111')
  })
  it('formata fixo de 10 digitos', () => {
    expect(mascaraTelefone('1932321010')).toBe('(19) 3232-1010')
  })
  it('formata parcialmente enquanto se digita', () => {
    expect(mascaraTelefone('19')).toBe('(19)')
    expect(mascaraTelefone('19332')).toBe('(19) 332')
  })
  it('nao passa de 11 digitos', () => {
    expect(mascaraTelefone('329849261119999')).toBe('(32) 98492-6111')
  })
})

describe('mascaraCep e cepValido', () => {
  it('formata no padrao XXXXX-XXX', () => {
    expect(mascaraCep('36570000')).toBe('36570-000')
    expect(mascaraCep('365')).toBe('365')
  })
  it('aceita CEP com oito digitos', () => {
    expect(cepValido('36570-000')).toBe(true)
  })
  it('rejeita CEP incompleto', () => {
    expect(cepValido('3657000')).toBe(false)
    expect(cepValido('')).toBe(false)
  })
})

describe('somenteDigitos', () => {
  it('tira tudo que nao e numero', () => {
    expect(somenteDigitos('(32) 98492-6111')).toBe('32984926111')
    expect(somenteDigitos('')).toBe('')
  })
})
