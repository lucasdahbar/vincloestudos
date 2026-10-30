import { describe, expect, it } from 'vitest'
import { cobradasEmOutroMes } from './outro-mes'

const item = {
  aluno_nome: 'Ana',
  descricao: 'Matemática — 9º ano — Aula regular',
  mes_cobranca: '2031-03-01',
  data_atual: '2031-04-03T14:00',
  data_cobrada: '2031-03-31T10:00',
}

describe('cobradasEmOutroMes (decisão 6)', () => {
  it('aula cobrada em março que foi para abril aparece em abril, com o aviso', () => {
    expect(cobradasEmOutroMes([item], '2031-04-01')).toEqual([
      {
        aluno_nome: 'Ana',
        descricao: 'Matemática — 9º ano — Aula regular',
        data: '2031-04-03',
        nota: 'cobrada em março, era 31/03 às 10:00',
      },
    ])
  })

  it('aula cobrada no próprio mês não aparece', () => {
    expect(cobradasEmOutroMes([{ ...item, mes_cobranca: '2031-04-01' }], '2031-04-01')).toEqual([])
  })

  it('aula que agora está em outro mês não aparece', () => {
    expect(cobradasEmOutroMes([item], '2031-05-01')).toEqual([])
  })

  it('ordena pela data da aula', () => {
    const outra = { ...item, aluno_nome: 'Bia', data_atual: '2031-04-01T09:00' }
    expect(cobradasEmOutroMes([item, outra], '2031-04-01').map((x) => x.aluno_nome)).toEqual(['Bia', 'Ana'])
  })
})
