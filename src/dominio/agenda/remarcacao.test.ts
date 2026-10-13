import { describe, expect, it } from 'vitest'
import { planejarRemarcacao, type AulaParaRemarcar } from './remarcacao'

// Aula de terça 14/10/2026, 15h–16h, nunca remarcada. "Agora" é 13/10 10h.
const aula = (over: Partial<AulaParaRemarcar> = {}): AulaParaRemarcar => ({
  status: 'Agendada',
  temPresenca: false,
  inicio: '2026-10-14T15:00',
  fim: '2026-10-14T16:00',
  original: null,
  fimOriginal: '2026-10-14T16:00',
  ...over,
})
const agora = '2026-10-13T10:00'

describe('planejarRemarcacao', () => {
  it('muda dia e horário e guarda o original', () => {
    expect(
      planejarRemarcacao(aula(), { data: '2026-10-16', inicio: '16:00', fim: '17:30' }, agora),
    ).toEqual({
      ok: true,
      inicio: '2026-10-16T16:00:00',
      fim: '2026-10-16T17:30:00',
      original: '2026-10-14T15:00:00',
    })
  })

  it('remarcar de novo mantém o original da regra', () => {
    const jaMovida = aula({
      inicio: '2026-10-16T16:00',
      fim: '2026-10-16T17:00',
      original: '2026-10-14T15:00',
    })
    const r = planejarRemarcacao(jaMovida, { data: '2026-10-17', inicio: '09:00', fim: '10:00' }, agora)
    expect(r.ok && r.original).toBe('2026-10-14T15:00:00')
  })

  it('voltar ao dia e horário de sempre desfaz a remarcação', () => {
    const jaMovida = aula({
      inicio: '2026-10-16T16:00',
      fim: '2026-10-16T17:00',
      original: '2026-10-14T15:00',
    })
    const r = planejarRemarcacao(jaMovida, { data: '2026-10-14', inicio: '15:00', fim: '16:00' }, agora)
    expect(r.ok && r.original).toBeNull()
  })

  it('pode ir para outro mês', () => {
    const r = planejarRemarcacao(aula(), { data: '2026-11-03', inicio: '15:00', fim: '16:00' }, agora)
    expect(r.ok).toBe(true)
  })

  it('aula que já aconteceu não é remarcada', () => {
    const r = planejarRemarcacao(
      aula({ temPresenca: true }),
      { data: '2026-10-16', inicio: '16:00', fim: '17:00' },
      agora,
    )
    expect(r).toEqual({ ok: false, erros: ['Esta aula já aconteceu: não dá para remarcar.'] })
    expect(planejarRemarcacao(aula({ status: 'Realizada' }), { data: '2026-10-16', inicio: '16:00', fim: '17:00' }, agora).ok).toBe(false)
  })

  it('aula excluída não é remarcada', () => {
    const r = planejarRemarcacao(aula({ status: 'Excluída' }), { data: '2026-10-16', inicio: '16:00', fim: '17:00' }, agora)
    expect(r).toEqual({ ok: false, erros: ['Esta aula foi excluída.'] })
  })

  it('término antes do início', () => {
    const r = planejarRemarcacao(aula(), { data: '2026-10-16', inicio: '16:00', fim: '15:00' }, agora)
    expect(r).toEqual({ ok: false, erros: ['O término deve ser depois do início.'] })
  })

  it('nova data no passado', () => {
    const r = planejarRemarcacao(aula(), { data: '2026-10-12', inicio: '16:00', fim: '17:00' }, agora)
    expect(r).toEqual({ ok: false, erros: ['O novo horário já passou.'] })
  })

  it('data ou horário em branco', () => {
    const r = planejarRemarcacao(aula(), { data: '', inicio: '16:00', fim: '17:00' }, agora)
    expect(r).toEqual({ ok: false, erros: ['Informe a nova data, o início e o término.'] })
  })
})
