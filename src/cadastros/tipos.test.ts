import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCadastro, valoresIniciais } from './tipos'

const materias = defineCadastro({
  tabela: 'materias',
  rotulo: { singular: 'Matéria', plural: 'Matérias', genero: 'f' },
  rota: 'materias',
  ordenacao: { coluna: 'nome' },
  campos: [
    { nome: 'nome', etiqueta: 'Nome', tipo: 'texto', schema: z.string().min(1), naLista: true },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

describe('defineCadastro', () => {
  it('preserva a definicao', () => {
    expect(materias.tabela).toBe('materias')
    expect(materias.campos).toHaveLength(2)
  })

  it('monta um schema Zod a partir dos campos', () => {
    expect(materias.schema.parse({ nome: 'Matemática', ativo: true })).toEqual({
      nome: 'Matemática',
      ativo: true,
    })
    expect(() => materias.schema.parse({ nome: '', ativo: true })).toThrow()
  })

  it('expoe apenas os campos marcados para a lista', () => {
    expect(materias.camposDaLista.map((c) => c.nome)).toEqual(['nome'])
  })
})

describe('valoresIniciais', () => {
  it('usa o padrao declarado quando existe', () => {
    expect(valoresIniciais(materias)).toEqual({ nome: '', ativo: true })
  })

  it('usa o registro existente na edicao', () => {
    expect(valoresIniciais(materias, { nome: 'Física', ativo: false })).toEqual({
      nome: 'Física',
      ativo: false,
    })
  })
})
