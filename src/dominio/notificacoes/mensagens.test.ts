import { describe, expect, it } from 'vitest'
import { planejarNotificacoes, type ContextoNotificacao } from './mensagens'

const base: ContextoNotificacao = {
  tipo: 'BoasVindas',
  aluno: { id: 1, nome: 'João Ribeiro', telefone: '(19) 99911-1111', email: 'joao@exemplo.com' },
  responsavel: { id: 10, nome: 'Ana Ribeiro', telefone: '(19) 99700-1111', email: 'ana@exemplo.com' },
  destinatario: 'Responsável',
  canal: 'WhatsApp',
  turma: {
    nome: 'Matemática · 9º ano · Aula particular · Online',
    dias: 'Ter, Qui',
    horario_inicio: '15:00',
    horario_fim: '16:00',
    modalidade: 'Online',
  },
  link: 'https://meet.exemplo.com/sala-123',
  referencia: { tipo: 'matriculas', id: 55 },
}

describe('planejarNotificacoes — quem recebe', () => {
  it('manda só para o responsável quando é a preferência', () => {
    const n = planejarNotificacoes(base)
    expect(n).toHaveLength(1)
    expect(n[0].destinatario_tipo).toBe('responsavel')
    expect(n[0].destinatario_id).toBe(10)
  })

  it('manda só para o aluno quando é a preferência', () => {
    const n = planejarNotificacoes({ ...base, destinatario: 'Aluno' })
    expect(n).toHaveLength(1)
    expect(n[0].destinatario_tipo).toBe('aluno')
    expect(n[0].destinatario_id).toBe(1)
  })

  it('manda para os dois quando a preferência é Ambos', () => {
    const n = planejarNotificacoes({ ...base, destinatario: 'Ambos' })
    expect(n).toHaveLength(2)
    expect(n.map((x) => x.destinatario_tipo).sort()).toEqual(['aluno', 'responsavel'])
  })

  it('gera uma mensagem por canal quando o canal é Ambos', () => {
    const n = planejarNotificacoes({ ...base, canal: 'Ambos' })
    expect(n).toHaveLength(2)
    expect(n.map((x) => x.canal).sort()).toEqual(['E-mail', 'WhatsApp'])
  })

  it('combina destinatário e canal Ambos em quatro mensagens', () => {
    const n = planejarNotificacoes({ ...base, destinatario: 'Ambos', canal: 'Ambos' })
    expect(n).toHaveLength(4)
  })

  it('não gera mensagem para quem não tem contato no canal escolhido', () => {
    // Sem telefone do aluno, não há como mandar WhatsApp para ele.
    const n = planejarNotificacoes({
      ...base,
      destinatario: 'Ambos',
      aluno: { ...base.aluno, telefone: null },
    })
    expect(n).toHaveLength(1)
    expect(n[0].destinatario_tipo).toBe('responsavel')
  })

  it('devolve vazio quando ninguém tem contato', () => {
    const n = planejarNotificacoes({
      ...base,
      aluno: { ...base.aluno, telefone: null, email: null },
      responsavel: { ...base.responsavel, telefone: null, email: null },
    })
    expect(n).toEqual([])
  })
})

describe('planejarNotificacoes — texto de boas-vindas', () => {
  const [n] = planejarNotificacoes(base)

  it('saúda o destinatário pelo primeiro nome', () => {
    expect(n.texto_gerado).toContain('Olá, Ana!')
  })

  it('fala do aluno na terceira pessoa quando é para o responsável', () => {
    expect(n.texto_gerado).toContain('João')
  })

  it('fala direto com o aluno quando é para ele', () => {
    const [a] = planejarNotificacoes({ ...base, destinatario: 'Aluno' })
    expect(a.texto_gerado).toContain('Olá, João!')
    expect(a.texto_gerado).toContain('Você foi matriculado')
  })

  it('traz a turma, os dias e o horário', () => {
    expect(n.texto_gerado).toContain('Matemática')
    expect(n.texto_gerado).toContain('Ter, Qui')
    expect(n.texto_gerado).toContain('15:00')
    expect(n.texto_gerado).toContain('16:00')
  })

  it('traz o link da sala', () => {
    expect(n.texto_gerado).toContain('https://meet.exemplo.com/sala-123')
  })

  it('marca o tipo e a referência, para não duplicar depois', () => {
    expect(n.tipo).toBe('BoasVindas')
    expect(n.referencia_tipo).toBe('matriculas')
    expect(n.referencia_id).toBe(55)
  })
})

describe('planejarNotificacoes — lembrete do link da aula', () => {
  const ctx: ContextoNotificacao = {
    ...base,
    tipo: 'LinkAula',
    referencia: { tipo: 'aulas', id: 77 },
    aula: { data_hora_inicio: '2026-08-04T15:00:00', link: 'https://meet.exemplo.com/aula-77' },
  }

  it('avisa o horário de início da aula', () => {
    const [n] = planejarNotificacoes(ctx)
    expect(n.texto_gerado).toContain('15:00')
    expect(n.texto_gerado).toContain('começa')
  })

  it('usa o link da aula, não o da turma', () => {
    const [n] = planejarNotificacoes(ctx)
    expect(n.texto_gerado).toContain('aula-77')
    expect(n.texto_gerado).not.toContain('sala-123')
  })

  it('agenda o envio para 30 minutos antes da aula', () => {
    const [n] = planejarNotificacoes(ctx)
    expect(n.agendado_para).toBe('2026-08-04T14:30:00.000Z')
  })

  it('aceita o formato que o Postgres devolve, com fuso', () => {
    // O banco entrega `2026-08-04T15:00:00+00:00`. Acrescentar "Z" as cegas
    // produzia `...+00:00Z`, data invalida — e derrubava a fila inteira.
    const [n] = planejarNotificacoes({
      ...ctx,
      aula: { data_hora_inicio: '2026-08-04T15:00:00+00:00', link: 'https://x/aula-77' },
    })
    expect(n.agendado_para).toBe('2026-08-04T14:30:00.000Z')
  })

  it('aceita data que ja termina em Z', () => {
    const [n] = planejarNotificacoes({
      ...ctx,
      aula: { data_hora_inicio: '2026-08-04T15:00:00Z', link: 'https://x/aula-77' },
    })
    expect(n.agendado_para).toBe('2026-08-04T14:30:00.000Z')
  })

  it('não agenda envio para boas-vindas: vai agora', () => {
    const [n] = planejarNotificacoes(base)
    expect(n.agendado_para).toBeNull()
  })
})

describe('planejarNotificacoes — turma presencial', () => {
  it('não gera lembrete de link para turma presencial', () => {
    // O link so faz sentido em aula online (Operacionais 4.5).
    const n = planejarNotificacoes({
      ...base,
      tipo: 'LinkAula',
      turma: { ...base.turma, modalidade: 'Presencial' },
      aula: { data_hora_inicio: '2026-08-04T15:00:00', link: null },
    })
    expect(n).toEqual([])
  })

  it('gera boas-vindas mesmo em turma presencial, sem link', () => {
    const n = planejarNotificacoes({
      ...base,
      turma: { ...base.turma, modalidade: 'Presencial' },
      link: null,
    })
    expect(n).toHaveLength(1)
    expect(n[0].texto_gerado).not.toContain('Link')
    expect(n[0].texto_gerado).toContain('Matemática')
  })
})
