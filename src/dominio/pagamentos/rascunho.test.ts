import { describe, expect, it } from 'vitest'
import { rascunhoBateComFechamento } from './rascunho'

const item = (presenca_id: number | null, pendencia_id: number | null, valor_professor: number) => ({
  presenca_id,
  pendencia_id,
  valor_professor,
})

describe('rascunhoBateComFechamento (etapa 7, decisão 3)', () => {
  const rascunho = [item(1, null, 5000), item(null, 7, 3000)]

  it('mesmas aulas e mesmos valores: confirma', () => {
    expect(rascunhoBateComFechamento(rascunho, [item(null, 7, 3000), item(1, null, 5000)])).toBe(true)
  })

  it('aula a mais (chamada feita depois do rascunho): refaz', () => {
    expect(rascunhoBateComFechamento(rascunho, [...rascunho, item(2, null, 5000)])).toBe(false)
  })

  it('aula a menos (chamada corrigida): refaz', () => {
    expect(rascunhoBateComFechamento(rascunho, [rascunho[0]])).toBe(false)
  })

  it('valor diferente (desconto na cobrança): refaz', () => {
    expect(rascunhoBateComFechamento(rascunho, [item(1, null, 4500), rascunho[1]])).toBe(false)
  })
})
