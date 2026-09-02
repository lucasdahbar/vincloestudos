/**
 * O caminho do dinheiro da Rodada 2: P1, P2, P3, P4, P5 e P6.
 *
 * Ciclo inteiro com dados próprios — professor, aluno, turma, aula e presença
 * criados aqui e apagados no fim. Nada da gestora é tocado: fechar, pagar ou
 * cancelar um registro real dela seria mexer na contabilidade do negócio.
 *
 * Uso: node scripts/verificar-pagamentos-rodada2.mjs
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
const emDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

const feito = {
  professor: null,
  aluno: null,
  turma: null,
  aulas: [],
  matricula: null,
  contas: [],
}

async function limpar() {
  for (const c of feito.contas) {
    await db.from('baixas_conta_pagar').delete().eq('conta_pagar_id', c)
    await db.from('itens_conta_pagar_professor').delete().eq('conta_pagar_id', c)
  }
  await db.from('presencas').delete().in('aula_id', feito.aulas)
  await db.from('contas_pagar_professor').delete().in('id', feito.contas)
  if (feito.matricula) await db.from('matriculas').delete().eq('id', feito.matricula)
  await db.from('aulas').delete().in('id', feito.aulas)
  if (feito.turma) await db.from('turmas').delete().eq('id', feito.turma)
  if (feito.aluno) await db.from('alunos').delete().eq('id', feito.aluno)
  if (feito.professor) {
    await db.from('professor_percentual_historico').delete().eq('professor_id', feito.professor)
    await db.from('professores').delete().eq('id', feito.professor)
  }
  await db.from('notificacoes').delete().eq('referencia_tipo', 'turma').eq('referencia_id', feito.turma ?? -1)
}

const nav = await chromium.launch()
const p = await nav.newPage()
const errosJs = []
p.on('pageerror', (e) => errosJs.push(e.message))
p.on('response', (r) => {
  if (r.status() >= 500) errosJs.push(`HTTP ${r.status()} em ${new URL(r.url()).pathname}`)
})

try {
  // ── Monta um cenário próprio ────────────────────────────────────────────
  const [{ data: servicos }, { data: anos }, { data: responsaveis }, { data: contas }] =
    await Promise.all([
      db.from('servicos').select('id, nome, permite_materia, permite_escola').eq('ativo', true),
      db.from('anos_escolares').select('id').eq('ativo', true).limit(1),
      db.from('responsaveis').select('id, nome').eq('ativo', true).limit(1),
      db.from('contas').select('id, nome').eq('ativo', true).limit(1),
    ])

  const servico = servicos[0]

  const { data: prof } = await db
    .from('professores')
    .insert({ nome: `${MARCA} Professor`, percentual_repasse: 60, ativo: true })
    .select('id')
    .single()
  feito.professor = prof.id

  const { data: alu } = await db
    .from('alunos')
    .insert({ nome: `${MARCA} Aluno`, responsavel_id: responsaveis[0].id, ativo: true })
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
      dias_semana: [1, 3],
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
      data_inicio: iso(emDias(-30)),
      data_fim: null,
      flag_reposicao: false,
    })
    .select('id')
    .single()
  feito.matricula = mat.id

  // Duas aulas passadas, em dias diferentes, para o agrupamento do relatório.
  for (const [dia, hora] of [
    [-7, '15:00'],
    [-7, '17:00'],
    [-5, '15:00'],
  ]) {
    const data = iso(emDias(dia))
    const { data: aula } = await db
      .from('aulas')
      .insert({
        turma_id: turma.id,
        google_calendar_event_id: `local:zzteste:${data}T${hora}`,
        data_hora_inicio: `${data}T${hora}:00`,
        data_hora_fim: `${data}T${hora === '15:00' ? '16:00' : '18:00'}:00`,
        status: 'Realizada',
      })
      .select('id')
      .single()
    feito.aulas.push(aula.id)

    await db.from('presencas').insert({
      aula_id: aula.id,
      aluno_id: alu.id,
      presente: true,
      flag_reposicao: false,
    })
  }

  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name="email"]', 'gestora@mesinharedonda.app')
  await p.fill('input[name="senha"]', env.SENHA_TESTE)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 })

  // ── P2 e P1 ─────────────────────────────────────────────────────────────
  secao('P2 · fechamento só com "Até" · P1 · idempotência')

  await p.goto(`${BASE}/pagamentos`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('select', { timeout: 20000 })
  await p.getByRole('combobox', { name: 'Professor' }).selectOption({ label: `${MARCA} Professor` })
  await p.getByRole('textbox', { name: /Até/ }).fill(iso(new Date()))
  await p.getByRole('button', { name: 'Calcular' }).click()
  await p.waitForTimeout(3000)

  const previa = await p.locator('body').innerText()
  const totalPrevisto = previa.match(/Total: (R\$[^\n]*)/)?.[1] ?? ''
  ck('a prévia acha as três presenças', (previa.match(/× 60% =|60%/g) ?? []).length >= 3 || previa.includes('60%'), totalPrevisto)

  await p.getByRole('button', { name: 'Gerar conta a pagar' }).click()
  await p.waitForTimeout(3500)

  const { data: conta } = await db
    .from('contas_pagar_professor')
    .select('id, valor_total, status, periodo_inicio, periodo_fim')
    .eq('professor_id', prof.id)
    .single()
  feito.contas.push(conta.id)
  const TOTAL = Number(conta.valor_total)
  const brl = (n) => `R$ ${n.toFixed(2).replace('.', ',')}`
  ck('gerou a conta a pagar', TOTAL > 0, brl(TOTAL))
  ck('nasce Pendente', conta.status === 'Pendente')
  ck('o período começa na aula mais antiga', conta.periodo_inicio === iso(emDias(-7)))

  const { data: reservadas } = await db
    .from('presencas')
    .select('id, conta_pagar_id')
    .in('aula_id', feito.aulas)
  ck(
    'P1: as presenças foram reservadas na hora, ainda Pendente',
    reservadas.every((r) => r.conta_pagar_id === conta.id),
  )

  // Fechar de novo o mesmo período não pode pagar duas vezes.
  await p.goto(`${BASE}/pagamentos`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('select', { timeout: 20000 })
  await p.getByRole('combobox', { name: 'Professor' }).selectOption({ label: `${MARCA} Professor` })
  await p.getByRole('textbox', { name: /Até/ }).fill(iso(new Date()))
  await p.getByRole('button', { name: 'Calcular' }).click()
  await p.waitForTimeout(3000)
  ck(
    'P1: fechar o mesmo período de novo não acha nada',
    (await p.locator('body').innerText()).includes('Nenhuma presença confirmada e ainda não paga'),
  )

  // ── P6 ──────────────────────────────────────────────────────────────────
  secao('P6 · formato do relatório')

  await p.goto(`${BASE}/pagamentos/${conta.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('pre', { timeout: 20000 })
  const relatorio = await p.locator('pre').innerText()

  ck('traz o nome do professor', relatorio.includes(`Fechamento — ${MARCA} Professor`))
  ck('e o período no formato "até"', /Período: até \d{2}\/\d{2}\/\d{4}/.test(relatorio))
  ck('agrupa por data + horário + turma', (relatorio.match(/\d{2}\/\d{2}, \d{2}h\d{2} — /g) ?? []).length === 3, `${(relatorio.match(/\d{2}\/\d{2}, \d{2}h\d{2} — /g) ?? []).length} blocos`)
  ck('separa as duas aulas do mesmo dia', relatorio.includes('15h00') && relatorio.includes('17h00'))
  ck('mostra a conta de cada linha', relatorio.includes('× 60% ='))
  ck('fecha com o total e a contagem', relatorio.includes(`TOTAL: ${brl(TOTAL)} (3 presenças)`), relatorio.match(/TOTAL:[^\n]*/)?.[0])
  ck('oferece imprimir', (await p.locator('body').innerText()).includes('Imprimir'))

  // ── P5 ──────────────────────────────────────────────────────────────────
  secao('P5 · cancelamento libera as presenças')

  ck('conta pendente oferece cancelar', (await p.locator('body').innerText()).includes('Cancelar este fechamento'))

  await p.getByRole('button', { name: 'Cancelar este fechamento' }).click()
  await p.getByRole('button', { name: 'Sim, cancelar o fechamento' }).click()
  await p.waitForTimeout(3000)

  const { data: cancelada } = await db
    .from('contas_pagar_professor')
    .select('status, valor_total')
    .eq('id', conta.id)
    .single()
  ck('a conta ficou Cancelada', cancelada.status === 'Cancelada', cancelada.status)
  ck('o valor fica registrado como histórico', Number(cancelada.valor_total) === TOTAL)

  const { data: soltas } = await db
    .from('presencas')
    .select('conta_pagar_id')
    .in('aula_id', feito.aulas)
  ck('as presenças voltaram a ficar livres', soltas.every((x) => x.conta_pagar_id === null))

  const { count: itensRestantes } = await db
    .from('itens_conta_pagar_professor')
    .select('*', { count: 'exact', head: true })
    .eq('conta_pagar_id', conta.id)
  ck(
    'os itens saíram junto: senão UNIQUE(presenca_id) travaria a presença para sempre',
    itensRestantes === 0,
    `${itensRestantes} item(ns)`,
  )
  ck('a tela não mostra relatório vazio de conta cancelada', !(await p.locator('pre').isVisible().catch(() => false)))

  // A prova de que a liberação foi de verdade: o mesmo fechamento sai de novo.
  await p.goto(`${BASE}/pagamentos`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('select', { timeout: 20000 })
  await p.getByRole('combobox', { name: 'Professor' }).selectOption({ label: `${MARCA} Professor` })
  await p.getByRole('textbox', { name: /Até/ }).fill(iso(new Date()))
  await p.getByRole('button', { name: 'Calcular' }).click()
  await p.waitForTimeout(2500)
  ck(
    'as presenças liberadas voltam ao fechamento seguinte',
    (await p.locator('body').innerText()).includes(`Total: ${brl(TOTAL)}`),
  )

  await p.getByRole('button', { name: 'Gerar conta a pagar' }).click()
  await p.waitForTimeout(3500)

  const { data: segunda } = await db
    .from('contas_pagar_professor')
    .select('id, valor_total, status')
    .eq('professor_id', prof.id)
    .neq('id', conta.id)
    .maybeSingle()
  ck('e geram um fechamento novo, do mesmo valor', Boolean(segunda) && Number(segunda.valor_total) === TOTAL)
  if (!segunda) throw new Error('sem segundo fechamento: o resto depende dele')
  feito.contas.push(segunda.id)

  // ── P3 ──────────────────────────────────────────────────────────────────
  secao('P3 · baixa parcial')

  await p.goto(`${BASE}/pagamentos/${segunda.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('pre', { timeout: 20000 })

  const comoTexto = (n) => n.toFixed(2).replace('.', ',')
  await p.getByRole('button', { name: 'Dar baixa no pagamento' }).click()
  await p.waitForTimeout(600)
  ck(
    'o valor já vem preenchido com o saldo',
    (await p.getByRole('textbox', { name: 'Valor pago' }).inputValue()) === comoTexto(TOTAL),
  )

  const primeiraParte = Math.round(TOTAL / 3)
  await p.getByRole('textbox', { name: 'Valor pago' }).fill(comoTexto(primeiraParte))
  await p.getByRole('combobox', { name: 'Conta', exact: true }).selectOption({ label: contas[0].nome })
  await p.getByRole('button', { name: 'Registrar pagamento' }).click()
  await p.waitForTimeout(3000)

  const { data: parcial } = await db
    .from('contas_pagar_professor')
    .select('status, data_pagamento')
    .eq('id', segunda.id)
    .single()
  ck('pagar menos que o total deixa a conta Parcial', parcial.status === 'Parcial', parcial.status)
  ck('e não marca data de pagamento ainda', parcial.data_pagamento === null)
  ck(
    'a tela mostra o que falta',
    (await p.locator('body').innerText()).includes(brl(TOTAL - primeiraParte)),
    brl(TOTAL - primeiraParte),
  )
  ck(
    'conta parcial não pode mais ser cancelada',
    !(await p.locator('body').innerText()).includes('Cancelar este fechamento'),
  )

  // ── P4 ──────────────────────────────────────────────────────────────────
  secao('P4 · pagamento direto por responsável')

  await p.getByRole('button', { name: 'Dar baixa no pagamento' }).click()
  await p.waitForTimeout(600)
  ck(
    'reabrir o formulário traz o saldo NOVO, não o valor da baixa anterior',
    (await p.getByRole('textbox', { name: 'Valor pago' }).inputValue()) ===
      comoTexto(TOTAL - primeiraParte),
    await p.getByRole('textbox', { name: 'Valor pago' }).inputValue(),
  )

  await p.getByRole('combobox', { name: /De onde saiu/ }).selectOption('Pago por responsável')
  await p.waitForTimeout(400)
  ck(
    'ao escolher responsável, some o campo de conta',
    !(await p.getByRole('combobox', { name: 'Conta', exact: true }).isVisible().catch(() => false)),
  )
  ck('e aparece o de responsável', await p.getByRole('combobox', { name: /Responsável que pagou/ }).isVisible())

  await p.getByRole('combobox', { name: /Responsável que pagou/ }).selectOption({ label: responsaveis[0].nome })
  await p.getByRole('button', { name: 'Registrar pagamento' }).click()
  await p.waitForTimeout(3000)

  const { data: quitada } = await db
    .from('contas_pagar_professor')
    .select('status, data_pagamento, conta_id')
    .eq('id', segunda.id)
    .single()
  ck('completar o valor quita a conta', quitada.status === 'Pago', quitada.status)
  ck('e marca a data do pagamento', Boolean(quitada.data_pagamento))
  ck('pagamento por responsável não vira saída de conta da empresa', quitada.conta_id === null)

  const { data: baixas } = await db
    .from('baixas_conta_pagar')
    .select('valor, origem, conta_id, responsavel_id')
    .eq('conta_pagar_id', segunda.id)
    .order('id')
  ck('as duas baixas ficaram registradas', baixas.length === 2, `${baixas.length}`)
  ck('a primeira saiu da conta da empresa', baixas[0]?.origem === 'Conta própria' && baixas[0]?.conta_id !== null)
  ck('a segunda foi paga pelo responsável', baixas[1]?.origem === 'Pago por responsável' && baixas[1]?.responsavel_id !== null)
  ck(
    'o banco recusa baixa com conta e responsável juntos',
    Boolean(
      (
        await db.from('baixas_conta_pagar').insert({
          conta_pagar_id: segunda.id,
          valor: 1,
          data: iso(new Date()),
          origem: 'Conta própria',
          conta_id: contas[0].id,
          responsavel_id: responsaveis[0].id,
        })
      ).error,
    ),
  )
  ck(
    'conta já paga não oferece cancelar',
    !(await p.locator('body').innerText()).includes('Cancelar este fechamento'),
  )

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

console.log(falhas === 0 ? '\n  Ciclo de pagamento conferido.' : `\n  ${falhas} falha(s).`)
process.exit(falhas ? 1 : 0)
