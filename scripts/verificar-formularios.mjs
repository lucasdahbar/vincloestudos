/**
 * Preenche e envia formularios de verdade, num navegador, como a usuaria faria.
 *
 * E o unico caminho que nao da para verificar por HTTP: o formulario envia por
 * Server Action, que precisa do JavaScript do cliente. Cria registros de teste
 * e apaga no fim.
 *
 * Uso: node scripts/verificar-formularios.mjs
 *      BASE=https://... node scripts/verificar-formularios.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE ?? 'http://localhost:3000'
const LARGURA = Number(process.argv[2] ?? 390)
const MARCA = `Teste ${Date.now().toString().slice(-6)}`

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  ...devices['iPhone 13'],
  viewport: { width: LARGURA, height: 844 },
})
const pagina = await contexto.newPage()

const erros = []
pagina.on('pageerror', (e) => erros.push(e.message))

await pagina.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await pagina.fill('input[name="email"]', 'gestora@mesinharedonda.app')
await pagina.fill('input[name="senha"]', env.SENHA_TESTE)
await pagina.click('button[type="submit"]')
await pagina.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 })

console.log(`Formulários em ${LARGURA}px — ${BASE}\n`)
const ck = (r, ok, extra = '') => console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${r}${extra ? ` — ${extra}` : ''}`)
let falhas = 0
const registrar = (ok) => !ok && falhas++

// ── 1. Criar uma matéria (cadastro mais simples) ─────────────────────────────
await pagina.goto(`${BASE}/cadastros/materias/novo`, { waitUntil: 'networkidle' })
await pagina.getByLabel('Nome da matéria').fill(MARCA)
await pagina.getByRole('button', { name: 'Salvar' }).click()

try {
  await pagina.waitForURL('**/cadastros/materias', { timeout: 15000 })
  const { data } = await db.from('materias').select('id, nome, ativo').eq('nome', MARCA)
  const criou = data?.length === 1
  ck('criar matéria pelo formulário', criou, criou ? `id ${data[0].id}, ativo=${data[0].ativo}` : 'não gravou')
  registrar(criou)

  const apareceu = await pagina.getByText(MARCA).first().isVisible()
  ck('aparece na listagem depois de salvar', apareceu)
  registrar(apareceu)
} catch (e) {
  ck('criar matéria pelo formulário', false, String(e).split('\n')[0].slice(0, 80))
  registrar(false)
}

// ── 2. Editar o registro ─────────────────────────────────────────────────────
const { data: criada } = await db.from('materias').select('id').eq('nome', MARCA).maybeSingle()

if (criada) {
  await pagina.goto(`${BASE}/cadastros/materias/${criada.id}`, { waitUntil: 'networkidle' })
  await pagina.getByLabel('Nome da matéria').fill(`${MARCA} editada`)
  await pagina.getByRole('button', { name: 'Salvar' }).click()

  try {
    await pagina.waitForURL('**/cadastros/materias', { timeout: 15000 })
    const { data } = await db.from('materias').select('nome').eq('id', criada.id).single()
    const editou = data.nome === `${MARCA} editada`
    ck('editar e salvar', editou, `nome no banco: "${data.nome}"`)
    registrar(editou)
  } catch (e) {
    ck('editar e salvar', false, String(e).split('\n')[0].slice(0, 80))
    registrar(false)
  }
}

// ── 3. Validação: campo obrigatório vazio ────────────────────────────────────
await pagina.goto(`${BASE}/cadastros/materias/novo`, { waitUntil: 'networkidle' })
await pagina.getByRole('button', { name: 'Salvar' }).click()
await pagina.waitForTimeout(2500)

const ficou = pagina.url().includes('/novo')
const temAviso = await pagina.getByText(/Confira os campos|Informe/i).first().isVisible().catch(() => false)
ck('barra o envio com campo obrigatório vazio', ficou, ficou ? 'permaneceu no formulário' : 'deixou salvar vazio')
registrar(ficou)
ck('mostra mensagem de erro em português', temAviso)
registrar(temAviso)

// ── 4. Registro com referência: aluno precisa de responsável ─────────────────
await pagina.goto(`${BASE}/cadastros/alunos/novo`, { waitUntil: 'networkidle' })
const opcoes = await pagina.locator('select').first().locator('option').count()
ck('formulário de aluno carrega os responsáveis', opcoes > 1, `${opcoes - 1} opção(ões)`)
registrar(opcoes > 1)

// ── Limpeza ──────────────────────────────────────────────────────────────────
if (criada) await db.from('materias').delete().eq('id', criada.id)
console.log(`\n  registros de teste removidos`)

if (erros.length) {
  console.log(`\n  ERROS DE JAVASCRIPT (${erros.length}):`)
  erros.slice(0, 3).forEach((e) => console.log(`    ${e.slice(0, 140)}`))
}

console.log(falhas === 0 && erros.length === 0 ? '\n  Escrita pelos formulários funciona.' : `\n  ${falhas} falha(s).`)
await navegador.close()
process.exit(falhas > 0 || erros.length > 0 ? 1 : 0)
