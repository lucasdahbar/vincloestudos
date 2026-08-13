import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { formatarCelula } from './formatar'
import type { DefinicaoCampo } from '@/cadastros/tipos'

const campo = (tipo: DefinicaoCampo['tipo']): DefinicaoCampo => ({
  nome: 'x',
  etiqueta: 'X',
  tipo,
  schema: z.any(),
})

describe('formatarCelula', () => {
  it('formata dinheiro vindo do numeric do Postgres', () => {
    expect(formatarCelula(campo('dinheiro'), '105.00', {})).toBe('R$ 105,00')
  })

  it('formata percentual', () => {
    expect(formatarCelula(campo('percentual'), '60.00', {})).toBe('60%')
    expect(formatarCelula(campo('percentual'), '62.50', {})).toBe('62,5%')
  })

  it('formata data no padrao brasileiro', () => {
    expect(formatarCelula(campo('data'), '2026-08-13', {})).toBe('13/08/2026')
  })

  it('formata booleano como Sim ou Nao', () => {
    expect(formatarCelula(campo('booleano'), true, {})).toBe('Sim')
    expect(formatarCelula(campo('booleano'), false, {})).toBe('Não')
  })

  it('resolve referencia pelo rotulo carregado no join', () => {
    const c: DefinicaoCampo = {
      ...campo('referencia'),
      nome: 'cidade_id',
      referencia: { tabela: 'cidades', rotulo: 'nome' },
    }
    expect(formatarCelula(c, 7, { cidade_id_ref: { id: 7, nome: 'Campinas' } })).toBe('Campinas')
  })

  it('mostra travessao para valor ausente', () => {
    expect(formatarCelula(campo('texto'), null, {})).toBe('—')
    expect(formatarCelula(campo('texto'), '', {})).toBe('—')
    expect(formatarCelula(campo('dinheiro'), null, {})).toBe('—')
  })
})
