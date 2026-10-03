import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { comFiltros, comoId, comoOpcao, comoTexto, deOpcoes, deValores } from './filtros'

describe('opções dos seletores', () => {
  it('cadastro (id, nome) vira opção com o id como valor', () => {
    expect(deOpcoes([{ id: 7, nome: 'Matemática' }])).toEqual([{ valor: '7', nome: 'Matemática' }])
  })

  it('valor fixo vira opção com ele mesmo como nome', () => {
    expect(deValores(['Ativa'])).toEqual([{ valor: 'Ativa', nome: 'Ativa' }])
  })
})

/**
 * Regressão: `deOpcoes` morava em src/ui/Filtros.tsx, que é 'use client'. As
 * páginas (servidor) chamavam a função, e o React recusa em produção com
 * "Attempted to call deOpcoes() from the server but it's on the client" —
 * Agenda, Turmas e Matrículas caíram. O build e o tsc não pegam.
 *
 * Módulo de cliente só exporta componente (nome com maiúscula), que o servidor
 * renderiza em vez de chamar. Função auxiliar mora fora dele.
 */
describe('módulos de cliente em src/ui', () => {
  const pasta = join(__dirname, '..', 'ui')
  const clientes = readdirSync(pasta)
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => /^\s*['"]use client['"]/.test(readFileSync(join(pasta, f), 'utf8')))

  it.each(clientes)('%s só exporta componentes', (arquivo) => {
    const codigo = readFileSync(join(pasta, arquivo), 'utf8')
    const funcoes = [...codigo.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(
      (m) => m[1],
    )
    expect(funcoes.filter((nome) => !/^[A-Z]/.test(nome))).toEqual([])
  })
})

describe('comoId', () => {
  it('lê um id positivo da URL', () => {
    expect(comoId('12')).toBe(12)
  })

  it('sem valor, o filtro não está aplicado', () => {
    expect(comoId(undefined)).toBeUndefined()
    expect(comoId('')).toBeUndefined()
  })

  it('recusa o que não é id, em vez de filtrar por lixo', () => {
    expect(comoId('abc')).toBeUndefined()
    expect(comoId('-3')).toBeUndefined()
    expect(comoId('1.5')).toBeUndefined()
  })

  it('com o parâmetro repetido, fica com o primeiro', () => {
    expect(comoId(['4', '9'])).toBe(4)
  })
})

describe('comoTexto', () => {
  it('lê o texto da URL', () => {
    expect(comoTexto('Ativa')).toBe('Ativa')
  })

  it('texto vazio ou só espaço não é filtro', () => {
    expect(comoTexto('')).toBeUndefined()
    expect(comoTexto('   ')).toBeUndefined()
    expect(comoTexto(undefined)).toBeUndefined()
  })

  it('tira os espaços das pontas da busca', () => {
    expect(comoTexto('  Ana ')).toBe('Ana')
  })
})

describe('comoOpcao', () => {
  const STATUS = ['Ativa', 'Encerrada'] as const

  it('aceita um valor da lista', () => {
    expect(comoOpcao('Encerrada', STATUS)).toBe('Encerrada')
  })

  it('recusa valor fora da lista', () => {
    // Iria cru para uma coluna enum: o Postgres recusaria e a tela quebraria.
    expect(comoOpcao('Qualquer', STATUS)).toBeUndefined()
    expect(comoOpcao('ativa', STATUS)).toBeUndefined()
  })

  it('sem valor, o filtro não está aplicado', () => {
    expect(comoOpcao(undefined, STATUS)).toBeUndefined()
  })
})

describe('comFiltros', () => {
  const CAMPOS = ['professor', 'status']

  it('leva os filtros para o link de navegação', () => {
    // Trocar de semana não pode perder o professor escolhido.
    expect(comFiltros('/agenda?vista=semana&data=2026-10-04', { professor: '3' }, CAMPOS)).toBe(
      '/agenda?vista=semana&data=2026-10-04&professor=3',
    )
  })

  it('só leva os campos de filtro, não o resto da URL', () => {
    // `data` é da navegação: levá-la junto prenderia o link na data antiga.
    expect(comFiltros('/agenda', { data: '2026-09', status: 'Realizada' }, CAMPOS)).toBe(
      '/agenda?status=Realizada',
    )
  })

  it('sem filtro, o link fica como estava', () => {
    expect(comFiltros('/agenda?vista=semana', {}, CAMPOS)).toBe('/agenda?vista=semana')
  })

  it('ignora filtro vazio', () => {
    expect(comFiltros('/agenda', { professor: '' }, CAMPOS)).toBe('/agenda')
  })
})
