import { describe, expect, it } from 'vitest'
import { DIAS_DE_VALIDADE, situacaoDoConvite, validadeDoConvite } from './convite'

describe('validadeDoConvite', () => {
  it('vale 7 dias a partir da criação', () => {
    expect(DIAS_DE_VALIDADE).toBe(7)
    expect(validadeDoConvite(new Date('2026-10-18T12:00:00Z')).toISOString()).toBe(
      '2026-10-25T12:00:00.000Z',
    )
  })
})

describe('situacaoDoConvite', () => {
  const base = {
    expira_em: '2026-10-25T12:00:00Z',
    usado_em: null,
    cancelado_em: null,
  }
  const agora = new Date('2026-10-20T12:00:00Z')

  it('válido enquanto não expirou, não foi usado e não foi cancelado', () => {
    expect(situacaoDoConvite(base, agora)).toBe('valido')
  })

  it('usado vale uma vez só', () => {
    expect(situacaoDoConvite({ ...base, usado_em: '2026-10-19T10:00:00Z' }, agora)).toBe('usado')
  })

  it('expirado depois do prazo', () => {
    expect(situacaoDoConvite(base, new Date('2026-10-25T12:00:01Z'))).toBe('expirado')
  })

  it('cancelado pela gestora', () => {
    expect(situacaoDoConvite({ ...base, cancelado_em: '2026-10-19T10:00:00Z' }, agora)).toBe(
      'cancelado',
    )
  })

  it('o uso tem precedência: quem já enviou vê "recebido", mesmo depois do prazo', () => {
    expect(
      situacaoDoConvite(
        { ...base, usado_em: '2026-10-19T10:00:00Z' },
        new Date('2026-11-30T00:00:00Z'),
      ),
    ).toBe('usado')
  })
})
