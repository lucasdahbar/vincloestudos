import { describe, expect, it } from 'vitest'
import { gerarTextoCobranca, type DadosDoTexto } from './texto'

const dados: DadosDoTexto = {
  responsavel_nome: 'Ana Ribeiro',
  mes_referencia: '2026-08-01',
  valor_total: 90500,
  chave_pix: 'mesinharedonda@email.com',
  vencimento: '2026-08-05',
  itens: [
    {
      aluno_nome: 'João',
      contexto: '9º ano — Matemática',
      descricao: 'Aulão de revisão',
      data: '2026-08-10',
      valor_final: 10500,
    },
    ...Array.from({ length: 8 }, (_, i) => ({
      aluno_nome: 'Maria',
      contexto: '7º ano — Português',
      descricao: 'Aula regular',
      data: `2026-08-${String(5 + i * 3).padStart(2, '0')}`,
      valor_final: 10000,
    })),
  ],
}

describe('gerarTextoCobranca', () => {
  const texto = gerarTextoCobranca(dados)

  it('abre saudando o responsavel pelo primeiro nome', () => {
    expect(texto).toContain('Olá, Ana!')
  })

  it('diz o mes de referencia por extenso', () => {
    expect(texto).toContain('agosto/2026')
  })

  it('agrupa por aluno, com o contexto entre parenteses', () => {
    expect(texto).toContain('João (9º ano — Matemática)')
    expect(texto).toContain('Maria (7º ano — Português)')
  })

  it('resume itens repetidos com a quantidade', () => {
    expect(texto).toContain('1x Aulão de revisão')
    expect(texto).toContain('8x Aula regular')
  })

  // Pedido do Julio (06/11/2026): os dias das aulas, e nao o periodo.
  it('lista os dias das aulas, com o mes uma vez so no fim', () => {
    expect(texto).toContain('8x Aula regular (05, 08, 11, 14, 17, 20, 23 e 26/08)')
    expect(texto).not.toContain(' a 26/08')
  })

  it('com uma aula so, mostra o dia dela', () => {
    expect(texto).toContain('1x Aulão de revisão (10/08)')
  })

  it('aulas de meses diferentes levam o mes em cada dia', () => {
    const t = gerarTextoCobranca({
      ...dados,
      itens: ['2026-08-28', '2026-09-04', '2026-09-11'].map((data) => ({
        aluno_nome: 'Maria',
        contexto: '7º ano — Português',
        descricao: 'Aula regular',
        data,
        valor_final: 10000,
      })),
    })
    expect(t).toContain('3x Aula regular (28/08, 04/09 e 11/09)')
  })

  it('duas aulas no mesmo dia nao repetem o dia', () => {
    const t = gerarTextoCobranca({
      ...dados,
      itens: ['2026-08-06', '2026-08-06', '2026-08-13'].map((data) => ({
        aluno_nome: 'Maria',
        contexto: '7º ano — Português',
        descricao: 'Aula regular',
        data,
        valor_final: 10000,
      })),
    })
    expect(t).toContain('3x Aula regular (06 e 13/08)')
  })

  it('soma o valor de cada grupo', () => {
    expect(texto).toContain('R$ 105,00')
    expect(texto).toContain('R$ 800,00')
  })

  it('fecha com o total liquido', () => {
    expect(texto).toContain('TOTAL: R$ 905,00')
  })

  it('inclui a chave Pix e o vencimento', () => {
    expect(texto).toContain('Pix: mesinharedonda@email.com')
    expect(texto).toContain('Vencimento: 05/08/2026')
  })

  it('omite a linha de Pix quando nao ha chave cadastrada', () => {
    const semPix = gerarTextoCobranca({ ...dados, chave_pix: null })
    expect(semPix).not.toContain('Pix:')
    expect(semPix).toContain('TOTAL:')
  })

  it('funciona com um unico aluno e um unico item', () => {
    const t = gerarTextoCobranca({
      ...dados,
      valor_total: 10000,
      itens: [
        {
          aluno_nome: 'Pedro',
          contexto: '8º ano — Física',
          descricao: 'Aula regular',
          data: '2026-08-11',
          valor_final: 10000,
        },
      ],
    })
    expect(t).toContain('Pedro (8º ano — Física)')
    expect(t).toContain('1x Aula regular')
    expect(t).toContain('TOTAL: R$ 100,00')
  })

  it('e texto puro, pronto para colar no WhatsApp', () => {
    expect(texto).not.toMatch(/<[a-z]/i)
    expect(texto.split('\n').length).toBeGreaterThan(5)
  })
})

// C1 (Rodada 2)
describe('cobrança complementar', () => {
  it('avisa que é adicional, para não parecer cobrança repetida', () => {
    const texto = gerarTextoCobranca({ ...dados, complementar: true })
    expect(texto).toContain('cobrança complementar')
    expect(texto).toContain('agosto/2026')
    expect(texto).toContain('não entraram na cobrança anterior')
  })

  it('a cobrança normal não menciona complemento', () => {
    expect(gerarTextoCobranca(dados)).not.toContain('complementar')
  })
})

describe('aulas já cobradas em outro mês (decisão 6)', () => {
  const texto = gerarTextoCobranca({
    ...dados,
    cobradasAntes: [
      {
        aluno_nome: 'Maria',
        descricao: 'Matemática — 9º ano — Aula regular',
        data: '2026-08-03',
        nota: 'cobrada em julho, era 31/07 às 10:00',
      },
    ],
  })

  it('lista a aula a R$ 0,00, com o aviso, antes do total', () => {
    const linha = 'Maria: 03/08 Aula regular (cobrada em julho, era 31/07 às 10:00) R$ 0,00'
    expect(texto).toContain('Aulas deste mês já cobradas antes:')
    expect(texto).toContain(linha)
    expect(texto.indexOf(linha)).toBeLessThan(texto.indexOf('TOTAL:'))
  })

  it('sem aula cobrada antes, o texto não muda', () => {
    expect(gerarTextoCobranca({ ...dados, cobradasAntes: [] })).toBe(gerarTextoCobranca(dados))
  })
})

describe('gerarTextoCobranca — texto editado pela gestora', () => {
  it('abertura editada troca so a primeira linha; a lista e o total seguem iguais', () => {
    const editado = gerarTextoCobranca(dados, {
      cobranca_abertura: 'Bom dia, {nome}! Aulas de {mes}:',
    })
    const original = gerarTextoCobranca(dados)
    expect(editado.split('\n')[0]).toBe('Bom dia, Ana! Aulas de agosto/2026:')
    expect(editado.split('\n').slice(1)).toEqual(original.split('\n').slice(1))
  })

  it('cobranca complementar usa a abertura propria', () => {
    const t = gerarTextoCobranca(
      { ...dados, complementar: true },
      {
        cobranca_abertura: 'NORMAL {nome}',
        cobranca_abertura_complementar: 'EXTRA {nome} {mes}',
      },
    )
    expect(t.split('\n')[0]).toBe('EXTRA Ana agosto/2026')
  })

  it('rodape editado entra depois da lista, com total, pix e vencimento', () => {
    const t = gerarTextoCobranca(dados, {
      cobranca_rodape: 'Total a pagar: {total}\nPague até {vencimento}.\nPix: {chave_pix}\nObrigado!',
    })
    expect(t.endsWith('Total a pagar: R$ 905,00\nPague até 05/08/2026.\nPix: mesinharedonda@email.com\nObrigado!')).toBe(true)
    expect(t).not.toContain('TOTAL:')
  })

  it('sem chave pix, o campo {pix} some e o vencimento continua', () => {
    const t = gerarTextoCobranca({ ...dados, chave_pix: null })
    expect(t.endsWith('Vencimento: 05/08/2026')).toBe(true)
    expect(t).not.toContain('Pix')
  })
})
