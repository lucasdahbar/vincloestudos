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

describe('valoresIniciais — formatação ao carregar (QA C5 e M1)', () => {
  const comTipos = defineCadastro({
    tabela: 't',
    rota: 't',
    rotulo: { singular: 'T', plural: 'Ts', genero: 'm' },
    ordenacao: { coluna: 'id' },
    campos: [
      { nome: 'valor', etiqueta: 'Valor', tipo: 'dinheiro', schema: z.string() },
      { nome: 'pct', etiqueta: 'Pct', tipo: 'percentual', schema: z.string() },
      { nome: 'cpf', etiqueta: 'CPF', tipo: 'cpf', schema: z.string().nullable() },
      { nome: 'tel', etiqueta: 'Tel', tipo: 'telefone', schema: z.string().nullable() },
      { nome: 'cep', etiqueta: 'CEP', tipo: 'cep', schema: z.string().nullable() },
      { nome: 'data', etiqueta: 'Data', tipo: 'data', schema: z.string().nullable() },
    ],
  })

  it('converte dinheiro que vem como número do banco', () => {
    // O bug C5: numeric(12,2) chega como number e o schema espera string,
    // travando QUALQUER edição do serviço — inclusive só mudar o nome.
    expect(valoresIniciais(comTipos, { valor: 105 }).valor).toBe('105,00')
    expect(valoresIniciais(comTipos, { valor: '105.00' }).valor).toBe('105,00')
    expect(valoresIniciais(comTipos, { valor: 1234.5 }).valor).toBe('1234,50')
  })

  it('converte percentual que vem como número', () => {
    expect(valoresIniciais(comTipos, { pct: 60 }).pct).toBe('60')
    expect(valoresIniciais(comTipos, { pct: '62.50' }).pct).toBe('62,5')
  })

  it('aplica máscara ao carregar, para o campo não abrir sem formato', () => {
    expect(valoresIniciais(comTipos, { cpf: '52998224725' }).cpf).toBe('529.982.247-25')
    expect(valoresIniciais(comTipos, { tel: '32984926111' }).tel).toBe('(32) 98492-6111')
    expect(valoresIniciais(comTipos, { cep: '36570000' }).cep).toBe('36570-000')
  })

  it('corta o horário da data, para caber no input type=date', () => {
    expect(valoresIniciais(comTipos, { data: '2026-08-04T00:00:00+00:00' }).data).toBe('2026-08-04')
  })

  it('trata nulo sem quebrar', () => {
    const v = valoresIniciais(comTipos, { valor: null, cpf: null, tel: null, data: null })
    expect(v.valor).toBe('')
    expect(v.cpf).toBe('')
    expect(v.data).toBe('')
  })
})
