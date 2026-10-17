import { describe, expect, it } from 'vitest'
import { destinosDoLink, linkEmail, linkWhatsApp } from './link-da-aula'
import type { ContextoNotificacao } from './mensagens'

const ctx: ContextoNotificacao = {
  tipo: 'LinkAula',
  aluno: { id: 1, nome: 'João Ribeiro', telefone: '(21) 99911-1111', email: 'joao@exemplo.com' },
  responsavel: { id: 10, nome: 'Ana Ribeiro', telefone: '(21) 99700-1111', email: 'ana@exemplo.com' },
  destinatario: 'Responsável',
  canal: 'WhatsApp',
  turma: {
    nome: 'Geografia · 6º ano · Online',
    quando: 'Sextas, às 11:00',
    horario_inicio: '11:00',
    horario_fim: '12:00',
    modalidade: 'Online',
  },
  referencia: { tipo: 'aulas', id: 77 },
  aula: { data_hora_inicio: '2026-10-16T11:00:00', link: 'https://meet.google.com/abc-defg-hij' },
}

describe('destinosDoLink — para quem sai o link desta aula', () => {
  it('um destino só, com o rótulo curto', () => {
    const d = destinosDoLink(ctx, [])
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({
      destinatario_tipo: 'responsavel',
      destinatario_id: 10,
      canal: 'WhatsApp',
      contato: '(21) 99700-1111',
      rotulo: 'Enviar link',
      enviado_em: null,
    })
    expect(d[0].texto).toContain('Segue o link para a aula de João')
  })

  it('preferência Ambos: um botão para cada um, dizendo quem', () => {
    const d = destinosDoLink({ ...ctx, destinatario: 'Ambos' }, [])
    expect(d.map((x) => x.rotulo)).toEqual(['Enviar link ao aluno', 'Enviar link ao responsável'])
  })

  it('canal Ambos: o rótulo diz o canal', () => {
    const d = destinosDoLink({ ...ctx, canal: 'Ambos' }, [])
    expect(d.map((x) => x.rotulo)).toEqual(['Enviar link por WhatsApp', 'Enviar link por e-mail'])
    expect(d[1].contato).toBe('ana@exemplo.com')
  })

  it('traz o horário do envio já registrado para o mesmo destino', () => {
    const d = destinosDoLink({ ...ctx, destinatario: 'Ambos' }, [
      {
        destinatario_tipo: 'responsavel',
        destinatario_id: 10,
        canal: 'WhatsApp',
        status: 'Enviada',
        enviado_em: '2026-10-16T13:32:00+00:00',
      },
    ])
    expect(d.find((x) => x.destinatario_tipo === 'responsavel')?.enviado_em).toBe(
      '2026-10-16T13:32:00+00:00',
    )
    expect(d.find((x) => x.destinatario_tipo === 'aluno')?.enviado_em).toBeNull()
  })

  it('registro que ainda não saiu (fila antiga) não conta como enviado', () => {
    const d = destinosDoLink(ctx, [
      { destinatario_tipo: 'responsavel', destinatario_id: 10, canal: 'WhatsApp', status: 'Pronta', enviado_em: null },
    ])
    expect(d[0].enviado_em).toBeNull()
  })

  it('aula sem link ou turma presencial: nenhum destino', () => {
    expect(destinosDoLink({ ...ctx, aula: { ...ctx.aula!, link: null } }, [])).toEqual([])
    expect(
      destinosDoLink({ ...ctx, turma: { ...ctx.turma, modalidade: 'Presencial' } }, []),
    ).toEqual([])
  })
})

describe('links que abrem o envio', () => {
  it('WhatsApp: só dígitos, com o 55 na frente', () => {
    expect(linkWhatsApp('(21) 99700-1111', 'Oi, tudo bem?')).toBe(
      'https://wa.me/5521997001111?text=Oi%2C%20tudo%20bem%3F',
    )
  })

  it('WhatsApp: não repete o 55 de quem já tem', () => {
    expect(linkWhatsApp('+55 21 99700-1111', 'x')).toBe('https://wa.me/5521997001111?text=x')
  })

  it('WhatsApp: número curto demais ou vazio não vira link', () => {
    expect(linkWhatsApp('9970', 'x')).toBeNull()
    expect(linkWhatsApp(null, 'x')).toBeNull()
  })

  it('e-mail: assunto e corpo no mailto', () => {
    expect(linkEmail('ana@exemplo.com', 'Link da aula', 'Oi\nAna')).toBe(
      'mailto:ana@exemplo.com?subject=Link%20da%20aula&body=Oi%0AAna',
    )
    expect(linkEmail(null, 'a', 'b')).toBeNull()
  })
})
