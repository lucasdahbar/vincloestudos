/**
 * Retorno de QA, Rodada 2 — os dois itens do tio:
 *   1. mascara de telefone faltando no cadastro de Aluno
 *   2. carregar os feriados nacionais de uma fonte publica
 *
 * Uso: node scripts/verificar-qa-rodada2.mjs   |   BASE=https://... node ...
 */
import { readFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const BASE = process.env.BASE ?? 'http://localhost:3000'
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let falhas = 0
const ck = (r, ok, x = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${r}${x ? ` — ${x}` : ''}`)
  if (!ok) falhas++
}

const nav = await chromium.launch()
const ctx = await nav.newContext({ ...devices['iPhone 13'], viewport: { width: 900, height: 900 } })
const p = await ctx.newPage()
const errosJs = []
p.on('pageerror', (e) => errosJs.push(e.message))

await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await p.fill('input[name="email"]', 'gestora@mesinharedonda.app')
await p.fill('input[name="senha"]', env.SENHA_TESTE)
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 25000 })

console.log('\n-- Item 1: mascara de telefone no cadastro de Aluno --')
await p.goto(`${BASE}/cadastros/alunos/novo`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
await p.getByLabel('Telefone').fill('32984926111')
ck('celular mascarado ao digitar', (await p.getByLabel('Telefone').inputValue()) === '(32) 98492-6111')
await p.getByLabel('Telefone').fill('1932321010')
ck('fixo mascarado ao digitar', (await p.getByLabel('Telefone').inputValue()) === '(19) 3232-1010')
await p.getByRole('textbox', { name: 'E-mail' }).fill('nao-e-email')
await p.getByLabel('Nome').click()
await p.waitForTimeout(600)
await p.getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(2500)
ck('e-mail inválido barra o salvamento', (await p.locator('form.max-w-2xl').innerText()).includes('E-mail inválido'))

// A mascara tem que valer nos tres cadastros de pessoa, nao so no aluno.
for (const rota of ['professores', 'responsaveis']) {
  await p.goto(`${BASE}/cadastros/${rota}/novo`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
  const campo = p.getByRole('textbox', { name: /Telefone/ }).first()
  await campo.fill('32984926111')
  ck(`${rota}: telefone segue mascarado`, (await campo.inputValue()) === '(32) 98492-6111')
}

console.log('\n-- Item 2: feriados nacionais de fonte publica --')
const ano = new Date().getFullYear() + 1 // ano futuro: nao mexe no que ela ja cadastrou
await db.from('feriados').delete().gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`)

await p.goto(`${BASE}/cadastros/feriados`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('input[type="number"]', { timeout: 20000 })
ck('a tela oferece carregar os nacionais', (await p.locator('body').innerText()).includes('Carregar feriados nacionais'))
ck('deixa claro que o manual continua', (await p.locator('body').innerText()).includes('estaduais, municipais'))

await p.locator('input[type="number"]').fill(String(ano))
await p.getByRole('button', { name: /Carregar feriados/ }).click()
await p.waitForTimeout(9000)

const { data: criados } = await db
  .from('feriados')
  .select('data,nome,abrangencia')
  .gte('data', `${ano}-01-01`)
  .lte('data', `${ano}-12-31`)
  .order('data')

ck('feriados nacionais gravados', criados.length >= 10, `${criados.length} em ${ano}`)
ck('todos marcados como Nacional', criados.every((f) => f.abrangencia === 'Nacional'))
ck('inclui o Natal', criados.some((f) => f.data === `${ano}-12-25`))
ck('aparecem na listagem', (await p.locator('body').innerText()).includes('25/12'))

// Rodar de novo nao pode duplicar.
await p.getByRole('button', { name: /Carregar feriados/ }).click()
await p.waitForTimeout(9000)
const { count: depois } = await db
  .from('feriados')
  .select('*', { count: 'exact', head: true })
  .gte('data', `${ano}-01-01`)
  .lte('data', `${ano}-12-31`)
ck('carregar de novo NÃO duplica', depois === criados.length, `${depois} (antes ${criados.length})`)
ck('avisa que nada era novo', (await p.locator('body').innerText()).includes('já estavam na lista'))

// Um feriado manual no mesmo dia nao pode virar duas linhas.
await db.from('feriados').delete().eq('data', `${ano}-12-25`)
await db.from('feriados').insert({ data: `${ano}-12-25`, nome: 'Natal (meu)', abrangencia: 'Municipal' })
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForSelector('input[type="number"]', { timeout: 20000 })
await p.locator('input[type="number"]').fill(String(ano))
await p.getByRole('button', { name: /Carregar feriados/ }).click()
await p.waitForTimeout(9000)
const { data: natal } = await db.from('feriados').select('nome').eq('data', `${ano}-12-25`)
ck('não duplica dia já cadastrado à mão com outro nome', natal.length === 1, natal.map((n) => n.nome).join(' + '))

// Limpeza: o ano de teste sai do calendario dela.
await db.from('feriados').delete().gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`)
console.log(`\n  feriados de teste (${ano}) removidos`)

if (errosJs.length) console.log(`  ERROS DE JAVASCRIPT: ${errosJs.slice(0, 2).join(' | ').slice(0, 150)}`)
console.log(falhas === 0 ? '\n  Os dois itens conferidos.' : `\n  ${falhas} falha(s).`)
await nav.close()
process.exit(falhas ? 1 : 0)
