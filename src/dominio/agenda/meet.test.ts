import { describe, expect, it } from 'vitest'
import {
  ajustesDeCoorganizador,
  CONFIGURACAO_DA_SALA,
  oQueFazerComASala,
  type TurmaDaSala,
} from './meet'

const online: TurmaDaSala = {
  modalidade: 'Online',
  status: 'Ativa',
  link_videochamada: null,
  google_meet_sala: null,
}

describe('oQueFazerComASala', () => {
  it('cria a sala para turma online ativa sem link', () => {
    expect(oQueFazerComASala(online)).toBe('criar')
  })

  it('não cria sala para turma presencial', () => {
    expect(oQueFazerComASala({ ...online, modalidade: 'Presencial' })).toBe('nada')
  })

  it('não cria sala para turma encerrada', () => {
    expect(oQueFazerComASala({ ...online, status: 'Encerrada' })).toBe('nada')
  })

  it('respeita o link colado à mão pela gestora', () => {
    // O link manual é uma escolha: sobrescrever faria a sala que ela já
    // mandou para os alunos parar de ser a da turma.
    expect(
      oQueFazerComASala({ ...online, link_videochamada: 'https://meet.google.com/abc-defg-hij' }),
    ).toBe('nada')
  })

  it('ajusta a sala que o sistema já criou, em vez de criar outra', () => {
    // Uma sala nova a cada edição trocaria o link que os alunos já têm.
    expect(
      oQueFazerComASala({
        ...online,
        google_meet_sala: 'spaces/abc',
        link_videochamada: 'https://meet.google.com/abc-defg-hij',
      }),
    ).toBe('ajustar')
  })
})

describe('CONFIGURACAO_DA_SALA', () => {
  it('é a configuração que a gestora validou no teste de 25/09/2026', () => {
    // Confiável: convidado entra direto, o resto pede para entrar. Moderação
    // ligada: é o que habilita coorganizador, e o coorganizador aceita os
    // alunos que ficam na fila.
    expect(CONFIGURACAO_DA_SALA).toEqual({
      config: { accessType: 'TRUSTED', entryPointAccess: 'ALL', moderation: 'ON' },
    })
  })
})

describe('ajustesDeCoorganizador', () => {
  const rafael = { name: 'spaces/abc/members/1', email: 'rafa@gmail.com', role: 'COHOST' }

  it('adiciona o professor quando a sala ainda não tem coorganizador', () => {
    expect(ajustesDeCoorganizador([], 'rafa@gmail.com')).toEqual({
      adicionar: 'rafa@gmail.com',
      remover: [],
    })
  })

  it('não faz nada quando o professor já é coorganizador', () => {
    expect(ajustesDeCoorganizador([rafael], 'rafa@gmail.com')).toEqual({
      adicionar: null,
      remover: [],
    })
  })

  it('compara e-mail sem diferenciar maiúsculas', () => {
    expect(ajustesDeCoorganizador([rafael], 'Rafa@Gmail.com').adicionar).toBeNull()
  })

  it('troca o coorganizador quando o professor da turma muda', () => {
    // O professor antigo não pode continuar aceitando alunos numa turma que
    // não é mais dele.
    expect(ajustesDeCoorganizador([rafael], 'kelly@gmail.com')).toEqual({
      adicionar: 'kelly@gmail.com',
      remover: ['spaces/abc/members/1'],
    })
  })

  it('sem e-mail do professor, só retira quem estava', () => {
    expect(ajustesDeCoorganizador([rafael], null)).toEqual({
      adicionar: null,
      remover: ['spaces/abc/members/1'],
    })
  })

  it('não mexe em quem não é coorganizador', () => {
    const outro = { name: 'spaces/abc/members/2', email: 'x@gmail.com', role: 'ROLE_UNSPECIFIED' }
    expect(ajustesDeCoorganizador([outro], 'rafa@gmail.com').remover).toEqual([])
  })
})
