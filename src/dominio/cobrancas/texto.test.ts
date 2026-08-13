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

  it('mostra o intervalo de datas quando ha mais de uma aula', () => {
    expect(texto).toContain('(05/08 a 26/08)')
  })

  it('nao mostra intervalo quando ha uma aula so', () => {
    const linha = texto.split('\n').find((l) => l.includes('Aulão de revisão'))!
    expect(linha).not.toContain(' a ')
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
