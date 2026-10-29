import { describe, expect, it } from 'vitest'
import { varrer, type AlunoDaVarredura, type AulaDaVarredura } from './varredura'
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
