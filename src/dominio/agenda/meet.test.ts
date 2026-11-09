import { describe, expect, it } from 'vitest'
import {
  ajustesDeCoorganizador,
  aulaPrecisaDeSala,
  CONFIGURACAO_DA_SALA,
  linkDaAula,
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
  it('turma que continua em outra não mexe mais na sala, que é da continuação (revisão de 30/10)', () => {
    expect(oQueFazerComASala({ ...online, google_meet_sala: 'spaces/abc', continuada: true })).toBe('nada')
  })

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

describe('linkDaAula', () => {
  const salaDaTurma = { modalidade: 'Online' as const, link_videochamada: 'https://meet.google.com/tur-ma' }
  const presencial = { modalidade: 'Presencial' as const, link_videochamada: null }

  it('aula online de turma online usa a sala da turma', () => {
    expect(linkDaAula({ modalidade: 'Online', link_online: null }, salaDaTurma)).toBe(salaDaTurma.link_videochamada)
  })

  it('o link proprio da aula vale mais que o da turma', () => {
    expect(linkDaAula({ modalidade: 'Online', link_online: 'https://meet.google.com/au-la' }, salaDaTurma)).toBe(
      'https://meet.google.com/au-la',
    )
  })

  it('aula que virou online numa turma presencial usa o link proprio (bug de 09/11/2026)', () => {
    expect(linkDaAula({ modalidade: 'Online', link_online: 'https://meet.google.com/au-la' }, presencial)).toBe(
      'https://meet.google.com/au-la',
    )
  })

  it('aula que virou presencial numa turma online nao tem link', () => {
    expect(linkDaAula({ modalidade: 'Presencial', link_online: null }, salaDaTurma)).toBeNull()
  })
})

describe('aulaPrecisaDeSala', () => {
  const presencial = { modalidade: 'Presencial' as const, link_videochamada: null }

  it('aula agendada que virou online numa turma presencial ganha sala propria', () => {
    expect(aulaPrecisaDeSala({ modalidade: 'Online', link_online: null, status: 'Agendada' }, presencial)).toBe(true)
  })

  it('nao cria outra sala se a aula ja tem link', () => {
    expect(
      aulaPrecisaDeSala({ modalidade: 'Online', link_online: 'https://meet.google.com/x', status: 'Agendada' }, presencial),
    ).toBe(false)
  })

  it('turma online: a sala e a da turma, e quem cuida dela e a turma', () => {
    // Se a sala da turma falhou, a proxima sincronizacao da turma tenta de
    // novo; uma sala so da aula deixaria dois links para o mesmo aluno.
    expect(
      aulaPrecisaDeSala(
        { modalidade: 'Online', link_online: null, status: 'Agendada' },
        { modalidade: 'Online', link_videochamada: null },
      ),
    ).toBe(false)
  })

  it('aula presencial ou fora de Agendada nao precisa de sala', () => {
    expect(aulaPrecisaDeSala({ modalidade: 'Presencial', link_online: null, status: 'Agendada' }, presencial)).toBe(false)
    expect(aulaPrecisaDeSala({ modalidade: 'Online', link_online: null, status: 'Realizada' }, presencial)).toBe(false)
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
