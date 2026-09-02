/**
 * O caminho da cobrança na Rodada 2: C1, C3, C4, C5 e C7.
 *
 * Cenário próprio — responsável, aluno, turma e aulas criados aqui e apagados
 * no fim. Confirmar ou cancelar uma cobrança real da gestora seria mexer no que
 * ela já mandou para os pais.
 *
 * Uso: node scripts/verificar-cobrancas-rodada2.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const BASE = process.env.BASE ?? 'http://localhost:3000'
const MARCA = 'ZZTESTE'
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let falhas = 0
const ck = (r, ok, x = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${r}${x ? ` — ${x}` : ''}`)
  if (!ok) falhas++
}
const secao = (t) => console.log(`\n-- ${t} --`)

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const feito = { responsavel: null, aluno: null, professor: null, turma: null, aulas: [], matricula: null, cobrancas: [] }

async function limpar() {
  for (const c of feito.cobrancas) await db.from('itens_cobranca').delete().eq('cobranca_id', c)
  await db.from('itens_cobranca').delete().in('aula_id', feito.aulas)
  await db.from('cobrancas').delete().in('id', feito.cobrancas)
  if (feito.responsavel) await db.from('cobrancas').delete().eq('responsavel_id', feito.responsavel)
  if (feito.matricula) await db.from('matriculas').delete().eq('id', feito.matricula)
  await db.from('matriculas').delete().eq('aluno_id', feito.aluno ?? -1)
  await db.from('aulas').delete().in('id', feito.aulas)
  if (feito.turma) await db.from('turmas').delete().eq('id', feito.turma)
  if (feito.aluno) await db.from('alunos').delete().eq('id', feito.aluno)
  if (feito.responsavel) await db.from('responsaveis').delete().eq('id', feito.responsavel)
  if (feito.professor) {
    await db.from('professor_percentual_historico').delete().eq('professor_id', feito.professor)
    await db.from('professores').delete().eq('id', feito.professor)
  }
  await db.from('notificacoes').delete().eq('referencia_tipo', 'turma').eq('referencia_id', feito.turma ?? -1)
}

/** Mês inteiro no futuro: não colide com nada que a gestora já tenha gerado. */
const base = new Date()
const MES = new Date(base.getFullYear() + 1, 5, 1)
const mesIso = `${MES.getFullYear()}-06`
const diaDoMes = (d) => `${mesIso}-${String(d).padStart(2, '0')}`

const nav = await chromium.launch()
const p = await nav.newPage()
const errosJs = []
p.on('pageerror', (e) => errosJs.push(e.message))
p.on('response', (r) => {
  if (r.status() >= 500) errosJs.push(`HTTP ${r.status()} em ${new URL(r.url()).pathname}`)
})

try {
  const [{ data: servicos }, { data: anos }] = await Promise.all([
    db.from('servicos').select('id, nome, permite_materia, permite_escola').eq('ativo', true),
    db.from('anos_escolares').select('id').eq('ativo', true).limit(1),
  ])
  const servico = servicos[0]

  const { data: resp } = await db
    .from('responsaveis')
    .insert({ nome: `${MARCA} Responsável`, telefone: '32988887777', ativo: true })
    .select('id, nome')
    .single()
  feito.responsavel = resp.id

  const { data: prof } = await db
    .from('professores')
    .insert({ nome: `${MARCA} Prof`, percentual_repasse: 60, ativo: true })
    .select('id')
    .single()
  feito.professor = prof.id

  const { data: alu } = await db
    .from('alunos')
    .insert({ nome: `${MARCA} Aluno`, responsavel_id: resp.id, ativo: true })
    .select('id')
    .single()
  feito.aluno = alu.id

  const { data: turma } = await db
    .from('turmas')
    .insert({
      nome: `${MARCA} Turma`,
      servico_id: servico.id,
      materia_id: servico.permite_materia
        ? (await db.from('materias').select('id').eq('ativo', true).limit(1).single()).data.id
        : null,
      escola_id: servico.permite_escola
        ? (await db.from('escolas').select('id').eq('ativo', true).limit(1).single()).data.id
        : null,
      ano_escolar_id: anos[0].id,
      professor_id: prof.id,
      modalidade: 'Online',
      tipo_recorrencia: 'Recorrente',
      dias_semana: [1],
      horario_inicio: '15:00',
      horario_fim: '16:00',
      status: 'Ativa',
    })
    .select('id')
    .single()
  feito.turma = turma.id

  const { data: mat } = await db
    .from('matriculas')
    .insert({
      aluno_id: alu.id,
      turma_id: turma.id,
      data_inicio: diaDoMes(1),
      data_fim: null,
      flag_reposicao: false,
    })
    .select('id')
    .single()
  feito.matricula = mat.id

  // Três aulas no mês; a terceira entra só depois, para provar o complementar.
  for (const dia of [8, 15]) {
    const { data: aula } = await db
      .from('aulas')
      .insert({
        turma_id: turma.id,
        google_calendar_event_id: `local:zzcob:${diaDoMes(dia)}T15:00`,
        data_hora_inicio: `${diaDoMes(dia)}T15:00:00`,
        data_hora_fim: `${diaDoMes(dia)}T16:00:00`,
        status: 'Agendada',
      })
      .select('id')
      .single()
    feito.aulas.push(aula.id)
  }

  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name="email"]', 'gestora@mesinharedonda.app')
  await p.fill('input[name="senha"]', env.SENHA_TESTE)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 })

  const nossaCobranca = async () => {
    const { data } = await db
      .from('cobrancas')
      .select('id, status, valor_total, complementar, conta_recebimento_id, texto_whatsapp')
      .eq('responsavel_id', resp.id)
      .order('id')
    for (const c of data ?? []) if (!feito.cobrancas.includes(c.id)) feito.cobrancas.push(c.id)
    return data ?? []
  }

  // ── Geração ─────────────────────────────────────────────────────────────
  secao('Geração do mês')

  await p.goto(`${BASE}/cobrancas`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('input[type="month"], input[type="text"], select', { timeout: 20000 })
  const campoMes = p.locator('input[type="month"]').first()
  if (await campoMes.isVisible().catch(() => false)) await campoMes.fill(mesIso)
  await p.getByRole('button', { name: /Gerar cobranças/ }).click()
  await p.waitForTimeout(4000)

  let cobrancas = await nossaCobranca()
  ck('gerou uma cobrança para o responsável de teste', cobrancas.length === 1, `${cobrancas.length}`)
  const primeira = cobrancas[0]
  ck('nasce como rascunho', primeira?.status === 'Rascunho')
  ck('e não é complementar', primeira?.complementar === false)

  const { count: itens1 } = await db
    .from('itens_cobranca')
    .select('*', { count: 'exact', head: true })
    .eq('cobranca_id', primeira.id)
  ck('com as duas aulas do mês', itens1 === 2, `${itens1} item(ns)`)

  // ── C3 e C4 ─────────────────────────────────────────────────────────────
  secao('C3 · desconto em lote · C4 · excluir item')

  await p.goto(`${BASE}/cobrancas/${primeira.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('table', { timeout: 20000 })

  ck('o rascunho oferece o desconto em lote', await p.getByText('Aplicar desconto a várias aulas').isVisible())
  await p.getByRole('combobox', { name: 'Grupo' }).selectOption({ index: 1 })
  await p.getByRole('textbox', { name: 'Desconto por aula' }).fill('5,00')
  await p.getByRole('button', { name: 'Aplicar' }).click()
  await p.waitForTimeout(3000)

  const { data: comDesconto } = await db
    .from('itens_cobranca')
    .select('desconto, valor_final, valor_original')
    .eq('cobranca_id', primeira.id)
  ck('aplicou o desconto nas duas linhas de uma vez', comDesconto.every((i) => Number(i.desconto) === 5), comDesconto.map((i) => i.desconto).join(', '))
  ck('e recalculou o valor final de cada uma', comDesconto.every((i) => Number(i.valor_final) === Number(i.valor_original) - 5))

  const { data: totalDepois } = await db
    .from('cobrancas')
    .select('valor_desconto, valor_total, valor_bruto')
    .eq('id', primeira.id)
    .single()
  ck('o total da cobrança acompanhou', Number(totalDepois.valor_desconto) === 10)

  // C4: tirar uma aula do rascunho.
  await p.getByRole('button', { name: /^Excluir a aula de/ }).first().click()
  await p.waitForTimeout(3000)
  const { count: itensDepois } = await db
    .from('itens_cobranca')
    .select('*', { count: 'exact', head: true })
    .eq('cobranca_id', primeira.id)
  ck('excluir item tira a aula da cobrança', itensDepois === 1, `${itensDepois}`)

  const { data: totalPos } = await db
    .from('cobrancas')
    .select('valor_total')
    .eq('id', primeira.id)
    .single()
  ck('e o total foi recalculado', Number(totalPos.valor_total) === Number(comDesconto[0].valor_final))

  // ── C5 ──────────────────────────────────────────────────────────────────
  secao('C5 · conta de recebimento define a chave Pix')

  const { data: contaPix } = await db
    .from('contas')
    .select('id, nome, chave_pix')
    .not('chave_pix', 'is', null)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  if (contaPix) {
    await p.getByRole('combobox', { name: /Conta que vai receber/ }).selectOption(String(contaPix.id))
    await p.waitForTimeout(2500)
    const { data: comConta } = await db
      .from('cobrancas')
      .select('conta_recebimento_id')
      .eq('id', primeira.id)
      .single()
    ck('gravou a conta escolhida', comConta.conta_recebimento_id === contaPix.id)
  }

  // ── Confirmação e C1 ────────────────────────────────────────────────────
  secao('C1 · cobrança complementar no mesmo mês')

  await p.getByRole('button', { name: /Confirmar cobrança/ }).click()
  await p.waitForTimeout(4000)

  const { data: confirmada } = await db
    .from('cobrancas')
    .select('status, texto_whatsapp')
    .eq('id', primeira.id)
    .single()
  ck('a cobrança foi confirmada', confirmada.status === 'Confirmada', confirmada.status)
  if (contaPix) {
    ck('o texto traz a chave Pix da conta escolhida', confirmada.texto_whatsapp?.includes(contaPix.chave_pix), contaPix.chave_pix)
  }
  ck('e não se anuncia como complementar', !confirmada.texto_whatsapp?.includes('complementar'))

  // Uma aula nova no mesmo mês — matrícula feita no meio do mês, no documento.
  const { data: aulaNova } = await db
    .from('aulas')
    .insert({
      turma_id: turma.id,
      google_calendar_event_id: `local:zzcob:${diaDoMes(22)}T15:00`,
      data_hora_inicio: `${diaDoMes(22)}T15:00:00`,
      data_hora_fim: `${diaDoMes(22)}T16:00:00`,
      status: 'Agendada',
    })
    .select('id')
    .single()
  feito.aulas.push(aulaNova.id)

  await p.goto(`${BASE}/cobrancas`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  const campoMes2 = p.locator('input[type="month"]').first()
  if (await campoMes2.isVisible().catch(() => false)) await campoMes2.fill(mesIso)
  await p.getByRole('button', { name: /Gerar cobranças/ }).click()
  await p.waitForTimeout(4000)

  cobrancas = await nossaCobranca()
  ck('gerou uma segunda cobrança no mesmo mês', cobrancas.length === 2, `${cobrancas.length}`)

  const complementar = cobrancas.find((c) => c.id !== primeira.id)
  ck('marcada como complementar', complementar?.complementar === true)
  ck('e a primeira continua Confirmada, intacta', cobrancas.find((c) => c.id === primeira.id)?.status === 'Confirmada')

  const { data: itensComp } = await db
    .from('itens_cobranca')
    .select('aula_id')
    .eq('cobranca_id', complementar.id)
  ck('só com as aulas ainda não cobradas', itensComp.length === 2, `${itensComp.length} item(ns)`)
  ck(
    'incluindo a aula nova',
    itensComp.some((i) => i.aula_id === aulaNova.id),
  )

  await p.goto(`${BASE}/cobrancas/${complementar.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('table', { timeout: 20000 })
  ck('a tela avisa que é complementar', (await p.locator('body').innerText()).includes('cobrança complementar'))

  await p.getByRole('button', { name: /Confirmar cobrança/ }).click()
  await p.waitForTimeout(4000)
  const { data: textoComp } = await db
    .from('cobrancas')
    .select('texto_whatsapp')
    .eq('id', complementar.id)
    .single()
  ck('o texto enviado diz que é complementar', textoComp.texto_whatsapp?.includes('cobrança complementar'))
  ck('e explica por quê', textoComp.texto_whatsapp?.includes('não entraram na cobrança anterior'))

  // ── C7 ──────────────────────────────────────────────────────────────────
  secao('C7 · cancelar libera as aulas')

  await p.goto(`${BASE}/cobrancas/${complementar.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('table', { timeout: 20000 })
  ck('a confirmada oferece cancelar', (await p.locator('body').innerText()).includes('Cancelar esta cobrança'))

  await p.getByRole('button', { name: 'Cancelar esta cobrança' }).click()
  await p.getByRole('button', { name: 'Sim, cancelar a cobrança' }).click()
  await p.waitForTimeout(3500)

  const { data: canc } = await db
    .from('cobrancas')
    .select('status, valor_total')
    .eq('id', complementar.id)
    .single()
  ck('ficou Cancelada', canc.status === 'Cancelada', canc.status)

  const { count: itensCanc } = await db
    .from('itens_cobranca')
    .select('*', { count: 'exact', head: true })
    .eq('cobranca_id', complementar.id)
  ck('os itens saíram, liberando as aulas', itensCanc === 0)

  // A prova: gerar de novo tem de reencontrar aquelas aulas.
  await p.goto(`${BASE}/cobrancas`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  const campoMes3 = p.locator('input[type="month"]').first()
  if (await campoMes3.isVisible().catch(() => false)) await campoMes3.fill(mesIso)
  await p.getByRole('button', { name: /Gerar cobranças/ }).click()
  await p.waitForTimeout(4000)

  cobrancas = await nossaCobranca()
  const terceira = cobrancas.find((c) => c.id !== primeira.id && c.id !== complementar.id)
  ck('as aulas liberadas voltam para uma cobrança nova', Boolean(terceira))
  if (terceira) {
    const { count: itens3 } = await db
      .from('itens_cobranca')
      .select('*', { count: 'exact', head: true })
      .eq('cobranca_id', terceira.id)
    ck('com as duas aulas que estavam na cancelada', itens3 === 2, `${itens3}`)
  }

  // Cobrança com recebimento não pode ser cancelada.
  const { data: contaQualquer } = await db.from('contas').select('id').eq('ativo', true).limit(1).single()
  await db.from('recebimentos').insert({
    cobranca_id: primeira.id,
    valor_recebido: 1,
    data_recebimento: iso(new Date()),
    conta_id: contaQualquer.id,
  })
  await p.goto(`${BASE}/cobrancas/${primeira.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('table', { timeout: 20000 })
  ck(
    'cobrança com recebimento não oferece cancelar',
    !(await p.locator('body').innerText()).includes('Cancelar esta cobrança'),
  )
  await db.from('recebimentos').delete().eq('cobranca_id', primeira.id)

  if (errosJs.length > 0) {
    console.log('\n  ERROS DE JAVASCRIPT / HTTP 500:')
    for (const e of [...new Set(errosJs)].slice(0, 6)) console.log(`    ${e}`)
    falhas += errosJs.length
  }
} finally {
  await limpar()
  console.log('\n  registros de teste removidos')
  await nav.close()
}

console.log(falhas === 0 ? '\n  Ciclo de cobrança conferido.' : `\n  ${falhas} falha(s).`)
process.exit(falhas ? 1 : 0)
