import { describe, expect, it } from 'vitest'
import { errosDaEdicao, planoDeSaida, varrer, type AlunoDaVarredura, type AulaDaVarredura } from './varredura'
import type { SituacaoDaAula } from './situacao'

const sit = (principal: SituacaoDaAula['principal'], over: Partial<SituacaoDaAula> = {}): SituacaoDaAula => ({
  principal,
  cobranca: null,
  pagamento: null,
  ...over,
})

const aluno = (over: Partial<AlunoDaVarredura> = {}): AlunoDaVarredura => ({
  aluno_id: 1,
  nome: 'Ana',
  vinculo: 'turma',
  avisou: false,
  cobranca: null,
  ...over,
})

const aula = (over: Partial<AulaDaVarredura> = {}): AulaDaVarredura => ({
  id: 10,
  data: '2026-11-09',
  inicio: '2026-11-09T18:00',
  situacao: sit('Confirmada'),
  alunos: [aluno()],
  ...over,
})

describe('varrer: editar dia ou horário', () => {
  const quando = { tipo: 'editar', quando: true } as const

  it('aula criada ou confirmada muda, e os alunos vão junto', () => {
    const v = varrer([aula({ situacao: sit('Criada'), alunos: [] }), aula({ id: 11 })], quando, 'serie')
    expect(v.aulas.map((a) => a.grupo)).toEqual(['muda', 'muda'])
    expect(v.mudam).toBe(2)
  })

  it('quem vem repor vai junto e entra na lista para avisar (decisão 13)', () => {
    const v = varrer(
      [aula({ alunos: [aluno(), aluno({ aluno_id: 2, nome: 'Bia', vinculo: 'reposicao' })] })],
      quando,
      'serie',
    )
    expect(v.aulas[0].grupo).toBe('muda')
    expect(v.avisar).toEqual([{ nome: 'Bia', data: '2026-11-09' }])
  })

  it('aula cobrada muda; se cair noutro mês, avisa que segue cobrada no original (decisão 6)', () => {
    const cobrada = aula({
      situacao: sit('Confirmada', { cobranca: 'Em cobrança' }),
      alunos: [aluno({ cobranca: 'Confirmada' })],
      data: '2026-11-30',
      novaData: '2026-12-01',
    })
    const v = varrer([cobrada], quando, 'serie')
    expect(v.aulas[0].grupo).toBe('muda')
    expect(v.aulas[0].avisos.join(' ')).toMatch(/continua cobrada em novembro/)
  })

  it('aula realizada fica como está', () => {
    const v = varrer([aula({ situacao: sit('Realizada') })], quando, 'serie')
    expect(v.aulas[0]).toMatchObject({ grupo: 'fica' })
    expect(v.aulas[0].motivo).toMatch(/já aconteceu/)
    expect(v.ficam).toBe(1)
  })

  it('aula aguardando chamada pergunta se aconteceu (decisão 5)', () => {
    const pendente = aula({ situacao: sit('Aguardando chamada') })
    expect(varrer([pendente], quando, 'serie').aulas[0]).toMatchObject({ grupo: 'escolha', pergunta: 'aconteceu' })

    const nao = varrer([pendente], quando, 'serie', { aconteceu: { 10: false } })
    expect(nao.aulas[0].grupo).toBe('muda')

    const sim = varrer([pendente], quando, 'serie', { aconteceu: { 10: true } })
    expect(sim.aulas[0].grupo).toBe('fica')
    expect(sim.aulas[0].motivo).toMatch(/chamada/)
  })
})

describe('varrer: editar o professor', () => {
  const professor = { tipo: 'editar', professor: true } as const

  it('muda em qualquer aula que ainda não aconteceu, cobrada ou não', () => {
    const v = varrer([aula({ situacao: sit('Confirmada', { cobranca: 'Recebida' }) })], professor, 'serie')
    expect(v.aulas[0].grupo).toBe('muda')
  })

  it('aula realizada só corrige em "só esta aula" e fora de pagamento (decisão 7)', () => {
    const realizada = aula({ situacao: sit('Realizada') })
    expect(varrer([realizada], professor, 'serie').aulas[0].grupo).toBe('fica')
    expect(varrer([realizada], professor, 'esta').aulas[0].grupo).toBe('muda')

    const emPagamento = aula({ situacao: sit('Realizada', { pagamento: 'Em pagamento' }) })
    const v = varrer([emPagamento], professor, 'esta')
    expect(v.aulas[0].grupo).toBe('fica')
    expect(v.aulas[0].motivo).toMatch(/pagamento/)
  })
})

describe('varrer: editar o serviço', () => {
  const servico = { tipo: 'editar', servico: true } as const

  it('muda enquanto nenhum aluno foi cobrado; rascunho não conta', () => {
    const v = varrer([aula({ alunos: [aluno({ cobranca: 'Rascunho' })] })], servico, 'serie')
    expect(v.aulas[0].grupo).toBe('muda')
  })

  it('aula cobrada fica: vale o que foi cobrado', () => {
    const v = varrer([aula({ alunos: [aluno({ cobranca: 'Confirmada' })] })], servico, 'serie')
    expect(v.aulas[0].grupo).toBe('fica')
    expect(v.aulas[0].motivo).toMatch(/cobrad/)
  })

  it('aula realizada e não cobrada muda (decisão 8), sem perguntar se aconteceu', () => {
    expect(varrer([aula({ situacao: sit('Realizada') })], servico, 'serie').aulas[0].grupo).toBe('muda')
    expect(varrer([aula({ situacao: sit('Aguardando chamada') })], servico, 'serie').aulas[0].grupo).toBe('muda')
  })
})

describe('varrer: várias mudanças juntas', () => {
  it('a aula muda no que pode e avisa o que fica', () => {
    const v = varrer(
      [aula({ alunos: [aluno({ cobranca: 'Confirmada' })] })],
      { tipo: 'editar', quando: true, servico: true },
      'serie',
    )
    expect(v.aulas[0]).toMatchObject({ grupo: 'muda', campos: { quando: true, servico: false } })
    expect(v.aulas[0].avisos.join(' ')).toMatch(/serviço/)
  })
})

describe('varrer: excluir', () => {
  const excluir = { tipo: 'excluir' } as const

  it('aula sem aluno é apagada sem perguntar', () => {
    const v = varrer([aula({ situacao: sit('Criada'), alunos: [] })], excluir, 'esta')
    expect(v.aulas[0]).toMatchObject({ grupo: 'muda', destino: 'apagada' })
  })

  it('aluno sem cobrança escolhe entre reposição e sem reposição', () => {
    const v = varrer([aula()], excluir, 'esta')
    expect(v.aulas[0].grupo).toBe('escolha')
    expect(v.aulas[0].alunos[0].opcoes).toEqual(['reposicao', 'sem-reposicao'])
  })

  it('aluno cobrado escolhe entre reposição e crédito (decisão 9)', () => {
    const v = varrer([aula({ alunos: [aluno({ cobranca: 'Quitada' })] })], excluir, 'esta')
    expect(v.aulas[0].alunos[0].opcoes).toEqual(['reposicao', 'credito'])
  })

  it('com as escolhas feitas, a aula muda: apagada se ninguém precisa dela, senão fica Excluída', () => {
    const semRep = varrer([aula()], excluir, 'esta', { alunos: { '10:1': 'sem-reposicao' } })
    expect(semRep.aulas[0]).toMatchObject({ grupo: 'muda', destino: 'apagada' })

    const comRep = varrer([aula()], excluir, 'esta', { alunos: { '10:1': 'reposicao' } })
    expect(comRep.aulas[0]).toMatchObject({ grupo: 'muda', destino: 'excluida' })

    const cobrada = varrer([aula({ alunos: [aluno({ cobranca: 'Confirmada' })] })], excluir, 'esta', {
      alunos: { '10:1': 'credito' },
    })
    expect(cobrada.aulas[0]).toMatchObject({ grupo: 'muda', destino: 'excluida' })
  })

  it('escolha que não vale para o aluno não conta', () => {
    const v = varrer([aula()], excluir, 'esta', { alunos: { '10:1': 'credito' } })
    expect(v.aulas[0].grupo).toBe('escolha')
  })

  it('quem avisou não ganha outra reposição; quem vem repor volta para as pendentes', () => {
    const v = varrer(
      [
        aula({
          alunos: [
            aluno({ avisou: true }),
            aluno({ aluno_id: 2, nome: 'Bia', vinculo: 'reposicao' }),
          ],
        }),
      ],
      excluir,
      'esta',
    )
    expect(v.aulas[0]).toMatchObject({ grupo: 'muda', destino: 'excluida', alunos: [] })
    expect(v.aulas[0].avisos.join(' ')).toMatch(/Bia volta para as reposições pendentes/)
    expect(v.avisar).toEqual([{ nome: 'Bia', data: '2026-11-09' }])
  })

  it('aula realizada não sai; aguardando chamada pergunta, e se aconteceu sugere a chamada', () => {
    expect(varrer([aula({ situacao: sit('Realizada') })], excluir, 'serie').aulas[0].grupo).toBe('fica')

    const pendente = aula({ situacao: sit('Aguardando chamada'), alunos: [] })
    expect(varrer([pendente], excluir, 'serie').aulas[0].pergunta).toBe('aconteceu')
    expect(varrer([pendente], excluir, 'serie', { aconteceu: { 10: false } }).aulas[0].grupo).toBe('muda')
    expect(varrer([pendente], excluir, 'serie', { aconteceu: { 10: true } }).aulas[0].motivo).toMatch(
      /faça a chamada/,
    )
  })
})

describe('varrer: o conjunto', () => {
  it('ignora as aulas que já estão fora da agenda e conta os grupos', () => {
    const v = varrer(
      [
        aula({ id: 1, situacao: sit('Excluída') }),
        aula({ id: 2, situacao: sit('Realizada') }),
        aula({ id: 3, alunos: [] , situacao: sit('Criada')}),
        aula({ id: 4 }),
      ],
      { tipo: 'excluir' },
      'serie',
    )
    expect(v.aulas.map((a) => a.id)).toEqual([2, 3, 4])
    expect([v.mudam, v.escolhas, v.ficam]).toEqual([1, 1, 1])
  })
})

describe('errosDaEdicao: aplicar a edição de uma aula (etapa 6b)', () => {
  const editar = (a: AulaDaVarredura, acao: { quando?: boolean; professor?: boolean }, aconteceu?: boolean) =>
    errosDaEdicao(
      varrer([a], { tipo: 'editar', ...acao }, 'esta', aconteceu === undefined ? {} : { aconteceu: { [a.id]: aconteceu } })
        .aulas[0],
      acao,
    )

  it('aula que muda não tem erro', () => {
    expect(editar(aula(), { quando: true, professor: true })).toEqual([])
  })

  it('sem resposta à pergunta da decisão 5, pede a resposta', () => {
    expect(editar(aula({ situacao: sit('Aguardando chamada') }), { quando: true })[0]).toMatch(/aconteceu/)
    expect(editar(aula({ situacao: sit('Aguardando chamada') }), { quando: true }, false)).toEqual([])
  })

  it('o que fica devolve o motivo', () => {
    expect(editar(aula({ situacao: sit('Realizada') }), { quando: true })[0]).toMatch(/já aconteceu/)
  })

  it('pedido em parte impossível também é erro: nada é aplicado pela metade', () => {
    const e = editar(aula({ situacao: sit('Realizada') }), { quando: true, professor: true })
    expect(e.join(' ')).toMatch(/dia ou o horário/)
  })

  it('aula que não existe mais', () => {
    expect(errosDaEdicao(undefined, { quando: true })[0]).toMatch(/não está mais na agenda/)
  })
})

describe('varrer: encerrar (etapa 6c)', () => {
  const encerrar = { tipo: 'encerrar' } as const

  it('aluno sem cobrança sai com a matrícula, sem pergunta', () => {
    const v = varrer([aula()], encerrar, 'a-partir')
    expect(v.aulas[0].grupo).toBe('muda')
    expect(v.aulas[0].alunos).toEqual([])
    expect(v.aulas[0].destino).toBe('apagada')
  })

  it('aluno já cobrado escolhe entre reposição e crédito', () => {
    const v = varrer([aula({ alunos: [aluno({ cobranca: 'Enviada' })] })], encerrar, 'a-partir')
    expect(v.aulas[0].grupo).toBe('escolha')
    expect(v.aulas[0].alunos[0].opcoes).toEqual(['reposicao', 'credito'])
    expect(v.aulas[0].destino).toBe('excluida')
  })

  it('quem vem repor volta para as pendentes e entra em avisar', () => {
    const v = varrer([aula({ alunos: [aluno({ vinculo: 'reposicao', nome: 'Bia' })] })], encerrar, 'a-partir')
    expect(v.aulas[0].grupo).toBe('muda')
    expect(v.avisar).toEqual([{ nome: 'Bia', data: '2026-11-09' }])
  })

  it('aula dada fica, e o motivo sugere encerrar depois dela', () => {
    const v = varrer([aula({ situacao: sit('Realizada') })], encerrar, 'a-partir')
    expect(v.aulas[0].grupo).toBe('fica')
    expect(v.aulas[0].motivo).toMatch(/dia seguinte/)
  })

  it('aula sem chamada pergunta se aconteceu (decisão 5)', () => {
    const a = aula({ situacao: sit('Aguardando chamada') })
    expect(varrer([a], encerrar, 'a-partir').aulas[0].pergunta).toBe('aconteceu')
    expect(varrer([a], encerrar, 'a-partir', { aconteceu: { 10: true } }).aulas[0].motivo).toMatch(/chamada/)
    expect(varrer([a], encerrar, 'a-partir', { aconteceu: { 10: false } }).aulas[0].grupo).toBe('muda')
  })
})

describe('planoDeSaida: o que gravar depois da prévia (etapa 6c)', () => {
  const excluir = { tipo: 'excluir' } as const
  const encerrar = { tipo: 'encerrar' } as const
  const plano = (aulas: AulaDaVarredura[], acao: typeof excluir | typeof encerrar, r = {}) =>
    planoDeSaida(aulas, varrer(aulas, acao, 'a-partir', r))

  it('com escolha faltando, não grava nada', () => {
    expect(plano([aula()], excluir).erros[0]).toMatch(/escolha/)
  })

  it('cada aluno leva o seu desfecho, e quem vem repor é devolvido', () => {
    const a = aula({
      alunos: [
        aluno(),
        aluno({ aluno_id: 2, cobranca: 'Confirmada' }),
        aluno({ aluno_id: 3, vinculo: 'reposicao' }),
        aluno({ aluno_id: 4, avisou: true }),
      ],
    })
    const p = plano([a], excluir, { alunos: { '10:1': 'sem-reposicao', '10:2': 'credito' } })
    expect(p.erros).toEqual([])
    expect(p.aulas).toEqual([
      {
        id: 10,
        data: '2026-11-09',
        alunos: [
          { aluno_id: 1, desfecho: 'sem-reposicao' },
          { aluno_id: 2, desfecho: 'credito' },
        ],
        devolver: [3],
      },
    ])
  })

  it('a aula que fica não entra no plano de excluir', () => {
    const p = plano([aula({ situacao: sit('Realizada') }), aula({ id: 11, alunos: [] })], excluir)
    expect(p.erros).toEqual([])
    expect(p.aulas.map((a) => a.id)).toEqual([11])
  })

  it('excluir sem nenhuma aula que sai é erro', () => {
    expect(plano([aula({ situacao: sit('Realizada') })], excluir).erros[0]).toMatch(/Nenhuma aula/)
  })

  it('encerrar com aula que fica é erro: a data tem de vir depois dela', () => {
    const p = plano([aula({ situacao: sit('Realizada') }), aula({ id: 11 })], encerrar)
    expect(p.erros[0]).toMatch(/09\/11.*dia seguinte/)
  })

  it('encerrar sem aula nenhuma pela frente é permitido (a turma só termina)', () => {
    expect(plano([], encerrar)).toEqual({ erros: [], aulas: [] })
  })
})
