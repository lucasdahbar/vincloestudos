import { describe, expect, it } from 'vitest'
import {
  acertoDaTroca,
  avisoDaTroca,
  devidoNaAula,
  descricaoDaDiferenca,
  resumoDaTroca,
  trocarServicoNaDescricao,
  type ItemNaTroca,
} from './troca-de-servico'

const item: ItemNaTroca = {
  status: 'Parcial',
  temRecebimento: true,
  valor_original: 10500,
  antes: 10500,
  depois: 15000,
}

describe('acertoDaTroca', () => {
  it('caso Ana Clara: paga em parte e mais cara -> complementar da diferenca', () => {
    expect(acertoDaTroca(item, true)).toEqual({ tipo: 'complementar', valor: 4500 })
  })

  it('paga e mais barata -> credito da diferenca', () => {
    expect(acertoDaTroca({ ...item, status: 'Quitada', antes: 15000, depois: 10500, valor_original: 15000 }, true)).toEqual({
      tipo: 'credito',
      valor: 4500,
    })
  })

  it('a Kelly dispensou: fica registrada, sem mexer no dinheiro', () => {
    expect(acertoDaTroca(item, false)).toEqual({ tipo: 'dispensada', valor: 4500 })
    expect(acertoDaTroca({ ...item, antes: 15000, depois: 10500 }, false)).toEqual({ tipo: 'dispensada', valor: -4500 })
  })

  it('sem recebimento corrige o item na propria cobranca, sem perguntar', () => {
    for (const status of ['Confirmada', 'Enviada'] as const) {
      expect(acertoDaTroca({ ...item, status, temRecebimento: false }, false)).toEqual({ tipo: 'ajustar', valor_original: 15000 })
    }
  })

  it('o ajuste parte do valor do item, nunca abaixo de zero', () => {
    expect(
      acertoDaTroca({ ...item, status: 'Confirmada', temRecebimento: false, valor_original: 2000, antes: 10500, depois: 6000 }, true),
    ).toEqual({ tipo: 'ajustar', valor_original: 0 })
  })

  it('enviada com recebimento segue pela diferenca', () => {
    expect(acertoDaTroca({ ...item, status: 'Enviada' }, true)).toEqual({ tipo: 'complementar', valor: 4500 })
  })

  it('rascunho e cancelada: nada, a geracao refaz', () => {
    expect(acertoDaTroca({ ...item, status: 'Rascunho', temRecebimento: false }, true)).toEqual({ tipo: 'nada' })
    expect(acertoDaTroca({ ...item, status: 'Cancelada', temRecebimento: false }, true)).toEqual({ tipo: 'nada' })
  })

  it('mesmo preco: nada', () => {
    expect(acertoDaTroca({ ...item, depois: 10500 }, true)).toEqual({ tipo: 'nada' })
  })
})

describe('devidoNaAula', () => {
  it('aula comum vale o servico', () => {
    expect(devidoNaAula(15000, null)).toBe(15000)
  })

  it('reposicao vale so a diferenca para a original, nunca negativa', () => {
    expect(devidoNaAula(15000, 10500)).toBe(4500)
    expect(devidoNaAula(10500, 15000)).toBe(0)
  })
})

describe('descricoes', () => {
  const desc = 'Matemática — 7º ano — Aula regular de reforço 1h - grupo'

  it('troca o nome do servico na descricao, mantendo a anotacao', () => {
    expect(
      trocarServicoNaDescricao(`${desc} (não participou: faltou)`, 'Aula regular de reforço 1h - grupo', 'Aula regular de reforço 1h - individual'),
    ).toBe('Matemática — 7º ano — Aula regular de reforço 1h - individual (não participou: faltou)')
  })

  it('sem o nome antigo na descricao, ela fica como esta', () => {
    expect(trocarServicoNaDescricao('Outra coisa', 'X', 'Y')).toBe('Outra coisa')
  })

  it('o item da complementar diz que e diferenca, entre parenteses', () => {
    expect(descricaoDaDiferenca(desc, 'Aula regular de reforço 1h - grupo', 'Aula regular de reforço 1h - individual')).toBe(
      'Matemática — 7º ano — Aula regular de reforço 1h - individual (diferença da troca de serviço)',
    )
  })
})

describe('resumoDaTroca', () => {
  it('junta por familia o que vai para complementar, credito e ajuste', () => {
    const r = resumoDaTroca([
      { responsavel_id: 1, responsavel_nome: 'Maíra', acerto: { tipo: 'complementar', valor: 4500 } },
      { responsavel_id: 1, responsavel_nome: 'Maíra', acerto: { tipo: 'complementar', valor: 4500 } },
      { responsavel_id: 2, responsavel_nome: 'Bia', acerto: { tipo: 'credito', valor: 4500 } },
      { responsavel_id: 3, responsavel_nome: 'Caio', acerto: { tipo: 'ajustar', valor_original: 15000 } },
      { responsavel_id: 4, responsavel_nome: 'Davi', acerto: { tipo: 'nada' } },
    ])
    expect(r).toEqual([
      { responsavel_id: 1, responsavel_nome: 'Maíra', complementar: 9000, credito: 0, ajustadas: 0 },
      { responsavel_id: 2, responsavel_nome: 'Bia', complementar: 0, credito: 4500, ajustadas: 0 },
      { responsavel_id: 3, responsavel_nome: 'Caio', complementar: 0, credito: 0, ajustadas: 1 },
    ])
  })
})

describe('avisoDaTroca', () => {
  it('nada mudou no dinheiro: sem aviso', () => {
    expect(avisoDaTroca({ complementar: 0, credito: 0, ajustadas: 0, dispensadas: 0, reenviar: 0 })).toBeNull()
  })

  it('diz o que foi para a complementar, o credito, o ajuste e o reenvio', () => {
    expect(avisoDaTroca({ complementar: 4500, credito: 9000, ajustadas: 2, dispensadas: 1, reenviar: 1 })).toBe(
      'Diferença de R$ 45,00 a cobrar: entra na complementar quando você gerar as cobranças do mês. ' +
        'Crédito de R$ 90,00 criado (veja em Créditos). ' +
        '2 aulas corrigidas na própria cobrança; 1 cobrança já enviada precisa ser reenviada. ' +
        '1 diferença dispensada.',
    )
  })
})
