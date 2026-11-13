// TEMPORARIO: roda contra o banco real. Apagar antes do commit.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

vi.mock('server-only', () => ({}))
vi.mock('@/dados/cliente', () => ({ clienteServidor: async () => admin }))

const { cancelarAviso } = await import('./reposicoes')
vi.setConfig({ testTimeout: 60000, hookTimeout: 90000 })

const ids = { resp: 0, aluno: 0, turma: 0, aulas: [] as number[], pend: [] as number[], creditos: [] as number[] }

async function cenario(n: number, usos: { tipo: string; valor: number }[] | null) {
  const { data: aula, error: eAula } = await admin
    .from('aulas')
    .insert({
      turma_id: ids.turma,
      google_calendar_event_id: `local:zz${ids.turma}:${n}`,
      data_hora_inicio: `2031-03-1${n}T19:00:00+00:00`,
      data_hora_fim: `2031-03-1${n}T20:00:00+00:00`,
      data_hora_referencia: `2031-03-1${n}T19:00:00+00:00`,
      status: 'Agendada',
    })
    .select('id')
    .single()
  if (eAula) throw eAula
  ids.aulas.push(aula!.id)
  const { data: p, error } = await admin
    .from('pendencias_reposicao')
    .insert({ aluno_id: ids.aluno, aula_origem_id: aula!.id, origem: 'Aviso', status: 'Desistida', cobrar: false, pagar_professor: false, decidido_em: new Date().toISOString() })
    .select('id')
    .single()
  if (error) throw error
  ids.pend.push(p!.id)
  let creditoId: number | null = null
  if (usos) {
    const { data: c } = await admin
      .from('creditos')
      .insert({ responsavel_id: ids.resp, aluno_id: ids.aluno, pendencia_id: p!.id, valor: 120, descricao: 'ZZ teste' })
      .select('id')
      .single()
    creditoId = c!.id
    ids.creditos.push(c!.id)
    for (const u of usos) {
      const { error: e } = await admin.from('usos_credito').insert({ credito_id: c!.id, tipo: u.tipo, valor: u.valor })
      if (e) throw e
    }
  }
  return { pendenciaId: p!.id as number, creditoId }
}

beforeAll(async () => {
  const { data: r, error: er } = await admin.from('responsaveis').insert({ nome: 'ZZ Resp Aviso', telefone: '(21) 90000-0000' }).select('id').single()
  if (er) throw er
  ids.resp = r!.id
  const { data: a, error: ea } = await admin.from('alunos').insert({ nome: 'ZZ Aluno Aviso', responsavel_id: ids.resp }).select('id').single()
  if (ea) throw ea
  ids.aluno = a!.id
  const { data: base } = await admin.from('turmas').select('*').eq('id', 72).single()
  const { id: _i, created_at: _c, updated_at: _u, google_calendar_event_id: _g, google_meet_sala: _m, google_evento_agenda: _e, ...resto } = base!
  const { data: t, error: et } = await admin
    .from('turmas')
    .insert({ ...resto, nome: 'ZZ Turma Aviso', tipo_recorrencia: 'Único', data_unica: '2031-03-10', dias_semana: [], data_inicio: '2031-03-10', data_fim: null, status: 'Encerrada', link_videochamada: null })
    .select('id')
    .single()
  if (et) throw et
  ids.turma = t!.id
})

afterAll(async () => {
  for (const c of ids.creditos) await admin.from('usos_credito').delete().eq('credito_id', c)
  if (ids.creditos.length) await admin.from('creditos').delete().in('id', ids.creditos)
  if (ids.pend.length) await admin.from('pendencias_reposicao').delete().in('id', ids.pend)
  if (ids.aulas.length) await admin.from('aulas').delete().in('id', ids.aulas)
  await admin.from('turmas').delete().eq('id', ids.turma)
  await admin.from('alunos').delete().eq('id', ids.aluno)
  await admin.from('responsaveis').delete().eq('id', ids.resp)
  const { count } = await admin.from('creditos').select('id', { count: 'exact', head: true }).eq('descricao', 'ZZ teste')
  const { count: t } = await admin.from('turmas').select('id', { count: 'exact', head: true }).like('nome', 'ZZ %')
  const { count: r } = await admin.from('responsaveis').select('id', { count: 'exact', head: true }).like('nome', 'ZZ %')
  console.log('RESIDUO', { creditos: count, turmas: t, responsaveis: r })
})

describe('cancelarAviso contra o banco', () => {
  it('caso Isabela: credito ja cancelado nao trava; aviso some, credito fica sem dono', async () => {
    const { pendenciaId, creditoId } = await cenario(1, [{ tipo: 'Cancelamento', valor: 120 }])
    const r = await cancelarAviso(pendenciaId)
    expect(r.ok, JSON.stringify(r.erros)).toBe(true)
    const { count } = await admin.from('pendencias_reposicao').select('id', { count: 'exact', head: true }).eq('id', pendenciaId)
    expect(count).toBe(0)
    const { data: c } = await admin.from('creditos').select('pendencia_id, usos:usos_credito (tipo, valor)').eq('id', creditoId!).single()
    expect(c!.pendencia_id).toBeNull()
    expect(c!.usos).toHaveLength(1)
  })

  it('credito intacto: estorna o saldo inteiro', async () => {
    const { pendenciaId, creditoId } = await cenario(2, [])
    const r = await cancelarAviso(pendenciaId)
    expect(r.ok, JSON.stringify(r.erros)).toBe(true)
    const { data: usos } = await admin.from('usos_credito').select('tipo, valor').eq('credito_id', creditoId!)
    expect(usos).toEqual([{ tipo: 'Cancelamento', valor: 120 }])
  })

  it('credito devolvido: trava e nada muda', async () => {
    const { pendenciaId, creditoId } = await cenario(3, [{ tipo: 'Devolução', valor: 50 }])
    const r = await cancelarAviso(pendenciaId)
    expect(r.ok).toBe(false)
    const { data: c } = await admin.from('creditos').select('pendencia_id').eq('id', creditoId!).single()
    expect(c!.pendencia_id).toBe(pendenciaId)
  })

  it('sem credito: cancela como antes', async () => {
    const { pendenciaId } = await cenario(4, null)
    expect((await cancelarAviso(pendenciaId)).ok).toBe(true)
  })
})
