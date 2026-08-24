import { describe, expect, it, vi } from 'vitest'
import { buscarFeriadosNacionais, feriadosQueFaltam } from './nacionais'

const resposta = (corpo: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as Response

const DOIS_FERIADOS = [
  { date: '2026-01-01', name: 'Confraternização mundial', type: 'national' },
  { date: '2026-12-25', name: 'Natal', type: 'national' },
]

describe('buscarFeriadosNacionais', () => {
  it('devolve os feriados do ano', async () => {
    const r = await buscarFeriadosNacionais(2026, async () => resposta(DOIS_FERIADOS))
    expect(r).toEqual({
      ok: true,
      feriados: [
        { data: '2026-01-01', nome: 'Confraternização mundial' },
        { data: '2026-12-25', nome: 'Natal' },
      ],
    })
  })

  it('padroniza a primeira letra do nome', async () => {
    const r = await buscarFeriadosNacionais(2026, async () =>
      resposta([{ date: '2026-01-01', name: 'confraternização mundial' }]),
    )
    expect(r.ok && r.feriados[0].nome).toBe('Confraternização mundial')
  })

  it('descarta data de outro ano', async () => {
    // Uma data fora do ano pedido entraria no calendário da gestora sem ela ver.
    const r = await buscarFeriadosNacionais(2026, async () =>
      resposta([...DOIS_FERIADOS, { date: '2027-01-01', name: 'Ano que vem' }]),
    )
    expect(r.ok && r.feriados).toHaveLength(2)
  })

  it('descarta item sem data ou sem nome', async () => {
    const r = await buscarFeriadosNacionais(2026, async () =>
      resposta([...DOIS_FERIADOS, { date: '2026-05-01' }, { name: 'Sem data' }]),
    )
    expect(r.ok && r.feriados).toHaveLength(2)
  })

  it('recusa ano fora da faixa sem nem chamar a API', async () => {
    const chamou = vi.fn()
    const r = await buscarFeriadosNacionais(1500, chamou)
    expect(chamou).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('Ano inválido') })
  })

  it('trata 404 da API', async () => {
    const r = await buscarFeriadosNacionais(2026, async () => resposta(null, 404))
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('não tem feriados') })
  })

  it('trata resposta vazia', async () => {
    const r = await buscarFeriadosNacionais(2026, async () => resposta([]))
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('Nenhum feriado') })
  })

  it('trata resposta em formato inesperado', async () => {
    const r = await buscarFeriadosNacionais(2026, async () => resposta({ erro: 'oops' }))
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('formato inesperado') })
  })

  it('sugere cadastrar à mão quando a consulta demora demais', async () => {
    const r = await buscarFeriadosNacionais(2026, async () => {
      const e = new Error('abortado')
      e.name = 'AbortError'
      throw e
    })
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('à mão') })
  })

  it('não quebra quando a API está fora', async () => {
    const r = await buscarFeriadosNacionais(2026, async () => {
      throw new Error('rede fora')
    })
    expect(r.ok).toBe(false)
  })
})

describe('feriadosQueFaltam', () => {
  const daApi = [
    { data: '2026-01-01', nome: 'Confraternização mundial' },
    { data: '2026-12-25', nome: 'Natal' },
  ]

  it('devolve todos quando nada foi cadastrado', () => {
    expect(feriadosQueFaltam(daApi, [])).toHaveLength(2)
  })

  it('pula o que já existe naquela data', () => {
    expect(feriadosQueFaltam(daApi, ['2026-01-01'])).toEqual([
      { data: '2026-12-25', nome: 'Natal' },
    ])
  })

  it('compara por data, não por nome', () => {
    // A gestora pode ter escrito "Natal" onde a API diz "Natal do Senhor";
    // o dia 25/12 não pode aparecer duas vezes no calendário.
    expect(feriadosQueFaltam([{ data: '2026-12-25', nome: 'Natal do Senhor' }], ['2026-12-25'])).toEqual([])
  })

  it('devolve vazio quando já está tudo lá', () => {
    expect(feriadosQueFaltam(daApi, ['2026-01-01', '2026-12-25'])).toEqual([])
  })
})
