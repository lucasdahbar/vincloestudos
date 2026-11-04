import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('./credenciais', () => ({
  accessToken: async () => ({ ok: true, token: 'token-falso' }),
}))

import { atualizarDescricao, sincronizarEvento } from './eventos'

/**
 * Turma 182, 04/11/2026: a ocorrência do dia ficou com "Nenhum aluno
 * matriculado" enquanto a de 11/11 recebeu o aluno. As escritas das
 * ocorrências saem juntas e o Google recusa algumas (limite de taxa, conflito
 * ou erro dele); sem nova tentativa, a descrição errada ficava até alguém
 * mexer na turma de novo.
 */
const resposta = (status: number) => new Response('{}', { status })

describe('atualizarDescricao', () => {
  it('tenta de novo quando o Google recusa de forma passageira', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(resposta(403)) // limite de taxa
      .mockResolvedValueOnce(resposta(500))
      .mockResolvedValueOnce(resposta(200))

    const r = await atualizarDescricao('agenda', 'evento_20261104T100000Z', 'texto', buscar as never, 0)

    expect(r).toEqual({ ok: true })
    expect(buscar).toHaveBeenCalledTimes(3)
  })

  it('desiste depois de algumas tentativas e devolve o motivo', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta(500))

    const r = await atualizarDescricao('agenda', 'evento', 'texto', buscar as never, 0)

    expect(r.ok).toBe(false)
    expect(buscar).toHaveBeenCalledTimes(4)
  })

  it('não insiste quando o evento não existe mais', async () => {
    const buscar = vi.fn().mockResolvedValue(resposta(404))

    const r = await atualizarDescricao('agenda', 'evento', 'texto', buscar as never, 0)

    expect(r).toMatchObject({ ok: false, naoExiste: true })
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  // Turma 274, 04/11/2026: o evento apagado à mão no Google não dá 404. Ele
  // continua lá como `cancelled` e aceita a escrita, e o sistema achava que
  // estava tudo certo enquanto a aula sumia da agenda do professor.
  it('evento apagado à mão (cancelled) conta como inexistente', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'evento', status: 'cancelled' }), { status: 200 }))

    const r = await atualizarDescricao('agenda', 'evento', 'texto', buscar as never, 0)

    expect(r).toMatchObject({ ok: false, naoExiste: true })
  })
})

describe('sincronizarEvento', () => {
  const dados = {
    nome: 'Geografia',
    tipo_recorrencia: 'Único' as const,
    data_unica: '2026-11-06',
    frequencia: null,
    intervalo: null,
    dias_semana: [],
    data_inicio: null,
    data_fim: null,
    horario_inicio: '16:00',
    horario_fim: '17:00',
    modalidade: 'Online' as const,
    alunos: [],
    google_calendar_id: 'agenda',
  }

  it('ao atualizar, traz de volta o evento apagado à mão no Google', async () => {
    const buscar = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'evento', status: 'confirmed' }), { status: 200 }))

    const r = await sincronizarEvento({ ...dados, evento_id: 'evento' } as never, buscar as never)

    expect(r).toEqual({ ok: true, eventoId: 'evento' })
    expect(JSON.parse(buscar.mock.calls[0][1].body)).toMatchObject({ status: 'confirmed' })
  })
})
