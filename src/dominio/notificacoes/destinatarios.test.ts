import { describe, expect, it } from 'vitest'
import {
  identificarDestinatario,
  TABELA_DO_DESTINATARIO,
  type PessoasPorTipo,
} from './destinatarios'

const pessoas: PessoasPorTipo = {
  aluno: new Map([[22, { id: 22, nome: 'Ana', telefone: '21999990000', email: 'ana@x.com' }]]),
  responsavel: new Map([[5, { id: 5, nome: 'Marta', telefone: '21988880000', email: null }]]),
  professor: new Map([
    [2, { id: 2, nome: 'Rafael de Oliveira Marcelino', telefone: null, email: 'rafa@x.com' }],
  ]),
}

describe('identificarDestinatario', () => {
  // Regressão: o aviso de turma nova (G4) vai para o professor, e a lista de
  // mensagens só procurava em alunos e responsáveis. Todo aviso de professor
  // aparecia como "Contato removido", mesmo com o cadastro completo.
  it('encontra o professor e o e-mail dele', () => {
    const r = identificarDestinatario(
      { destinatario_tipo: 'professor', destinatario_id: 2, canal: 'E-mail' },
      pessoas,
    )
    expect(r).toEqual({ destinatario_nome: 'Rafael de Oliveira Marcelino', contato: 'rafa@x.com' })
  })

  it('usa o telefone quando o canal é WhatsApp', () => {
    const r = identificarDestinatario(
      { destinatario_tipo: 'aluno', destinatario_id: 22, canal: 'WhatsApp' },
      pessoas,
    )
    expect(r.contato).toBe('21999990000')
  })

  it('devolve contato vazio quando a pessoa existe mas não tem o dado do canal', () => {
    const r = identificarDestinatario(
      { destinatario_tipo: 'responsavel', destinatario_id: 5, canal: 'E-mail' },
      pessoas,
    )
    expect(r).toEqual({ destinatario_nome: 'Marta', contato: null })
  })

  it('só diz "Contato removido" quando a pessoa realmente não existe', () => {
    const r = identificarDestinatario(
      { destinatario_tipo: 'professor', destinatario_id: 999, canal: 'E-mail' },
      pessoas,
    )
    expect(r).toEqual({ destinatario_nome: 'Contato removido', contato: null })
  })
})

describe('TABELA_DO_DESTINATARIO', () => {
  it('sabe onde procurar cada tipo de destinatário, professor incluído', () => {
    expect(TABELA_DO_DESTINATARIO).toEqual({
      aluno: 'alunos',
      responsavel: 'responsaveis',
      professor: 'professores',
    })
  })
})
