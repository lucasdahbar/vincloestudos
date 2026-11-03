import { describe, expect, it } from 'vitest'
import { CHAVES, MODELOS, textoDoModelo } from './catalogo'
import { camposUsados, preencher, validarModelo } from './preencher'

describe('catalogo de mensagens', () => {
  it.each(CHAVES)('%s: o texto original passa na propria validacao', (chave) => {
    const m = MODELOS[chave]
    const campos = m.campos.map((c) => c.nome)
    expect(validarModelo(m.padrao, campos, m.obrigatorios)).toEqual([])
  })

  it.each(CHAVES)('%s: todo campo tem exemplo, e a previa nao deixa {campo} cru', (chave) => {
    const m = MODELOS[chave]
    for (const c of m.campos) expect(m.exemplo).toHaveProperty(c.nome)
    expect(preencher(m.padrao, m.exemplo)).not.toMatch(/\{\w+\}/)
  })

  it.each(CHAVES)('%s: os obrigatorios existem entre os campos', (chave) => {
    const m = MODELOS[chave]
    const campos = m.campos.map((c) => c.nome)
    for (const o of m.obrigatorios) expect(campos).toContain(o)
  })

  it('o texto original usa so campos do catalogo', () => {
    for (const chave of CHAVES) {
      const campos = MODELOS[chave].campos.map((c) => c.nome)
      for (const usado of camposUsados(MODELOS[chave].padrao)) expect(campos).toContain(usado)
    }
  })
})

describe('textoDoModelo', () => {
  it('sem edicao, vale o texto original', () => {
    expect(textoDoModelo('convite_cadastro')).toBe(MODELOS.convite_cadastro.padrao)
    expect(textoDoModelo('convite_cadastro', {})).toBe(MODELOS.convite_cadastro.padrao)
  })

  it('com edicao, vale a edicao', () => {
    expect(textoDoModelo('convite_cadastro', { convite_cadastro: 'Oi {link}' })).toBe('Oi {link}')
  })

  it('edicao em branco nao vale: volta ao original', () => {
    expect(textoDoModelo('convite_cadastro', { convite_cadastro: '  ' })).toBe(
      MODELOS.convite_cadastro.padrao,
    )
  })
})
