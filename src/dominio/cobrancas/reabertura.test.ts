import { describe, expect, it } from 'vitest'
import { podeReabrirCobranca } from './reabertura'

const limpa = { recebimentos: 0, aulasPagasAoProfessor: 0, creditos: 0 }

describe('podeReabrirCobranca', () => {
  it('confirmada sem nada andando volta para rascunho', () => {
    expect(podeReabrirCobranca('Confirmada', limpa)).toEqual({ pode: true })
  })

  it('enviada nao reabre: o responsavel ja leu o valor', () => {
    const r = podeReabrirCobranca('Enviada', limpa)
    expect(r.pode).toBe(false)
  })

  it('so confirmada reabre', () => {
    for (const s of ['Rascunho', 'Parcial', 'Quitada', 'Cancelada'] as const) {
      expect(podeReabrirCobranca(s, limpa).pode).toBe(false)
    }
  })

  it('com recebimento nao reabre (inclui credito abatido)', () => {
    const r = podeReabrirCobranca('Confirmada', { ...limpa, recebimentos: 1 })
    expect(r.pode).toBe(false)
  })

  it('com aula ja paga ao professor nao reabre', () => {
    const r = podeReabrirCobranca('Confirmada', { ...limpa, aulasPagasAoProfessor: 1 })
    expect(r.pode).toBe(false)
  })

  it('com credito saido de uma aula dela nao reabre', () => {
    const r = podeReabrirCobranca('Confirmada', { ...limpa, creditos: 1 })
    expect(r.pode).toBe(false)
    if (!r.pode) expect(r.motivo).toMatch(/cancel/i)
  })
})
