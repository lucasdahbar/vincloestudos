/**
 * Verifica, item a item, o retorno de QA da Rodada 1 (Modulo de Cadastros).
 * Cada bloco cita o codigo do item no documento da gestora.
 *
 * Uso: node scripts/verificar-qa-rodada1.mjs   |   BASE=https://... node ...
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

console.log('\n-- C1: Cidades/Estados eliminados --')
await p.goto(`${BASE}/cadastros/cidades`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(2000)
ck('rota /cadastros/cidades nao existe mais', (await p.locator('body').innerText()).includes('não existe'))
await p.goto(`${BASE}/cadastros/responsaveis`, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(1500)
ck('menu nao lista Cidades', !(await p.locator('nav').first().innerText()).includes('Cidades'))
const { error: eCid } = await db.from('cidades').select('id').limit(1)
ck('tabela cidades removida do banco', Boolean(eCid))

console.log('\n-- M3 + M4: endereco por CEP no Responsavel --')
await p.goto(`${BASE}/cadastros/responsaveis/novo`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
const texto = (await p.locator('form.max-w-2xl').innerText())
for (const campo of ['CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'Estado (UF)']) {
  ck(`campo "${campo}" existe`, texto.includes(campo))
}
ck('nao ha mais seletor de cidade', (await p.locator('form select').count()) === 0)

console.log('\n-- M4: busca automatica no ViaCEP --')
await p.getByLabel('CEP').fill('01001-000')
await p.getByLabel('Nome').click()
await p.waitForTimeout(5000)
const cidade = await p.getByLabel('Cidade').inputValue()
const uf = await p.getByLabel('Estado (UF)').inputValue()
const logr = await p.getByLabel('Logradouro').inputValue()
ck('CEP preencheu cidade e estado', cidade.length > 0 && uf.length === 2, `${logr || '(sem logradouro)'} - ${cidade}/${uf}`)

await p.getByLabel('CEP').fill('00000-000')
await p.getByLabel('Nome').click()
await p.waitForTimeout(5000)
ck('CEP inexistente mostra mensagem', (await p.locator('form.max-w-2xl').innerText()).includes('não encontrado'))

console.log('\n-- M1: mascaras durante a digitacao --')
await p.getByLabel('Telefone (WhatsApp)').fill('32984926111')
ck('telefone mascarado ao digitar', (await p.getByLabel('Telefone (WhatsApp)').inputValue()) === '(32) 98492-6111')
await p.getByLabel('CPF').fill('52998224725')
ck('CPF mascarado ao digitar', (await p.getByLabel('CPF').inputValue()) === '529.982.247-25')
await p.getByLabel('CPF').fill('52998224724')
await p.getByLabel('Nome').click()
await p.waitForTimeout(900)
ck('CPF invalido avisa na hora', (await p.locator('form.max-w-2xl').innerText()).includes('CPF inválido'))

console.log('\n-- M1: campo obrigatorio barra o salvamento --')
await p.goto(`${BASE}/cadastros/responsaveis/novo`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
await p.getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(3000)
ck('nao salva sem o nome', p.url().includes('/novo'))
ck('diz qual campo falta', /Informe o nome|Confira os campos/.test(await p.locator('form.max-w-2xl').innerText()))

console.log('\n-- C5: edicao de Servico --')
const { data: srv } = await db.from('servicos').select('id,nome,valor_padrao').limit(1).single()
await p.goto(`${BASE}/cadastros/servicos/${srv.id}`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
const valorNaTela = await p.getByLabel('Valor por aula').inputValue()
ck('valor abre formatado, nao como numero cru', valorNaTela.includes(','), valorNaTela)
await p.getByLabel('Nome do serviço').fill(`${srv.nome} `)
await p.getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(4000)
ck('salvar mexendo so no nome NAO da erro de tipo', !(await p.locator('body').innerText()).includes('expected string'))
ck('voltou para a listagem', p.url().endsWith('/cadastros/servicos'))
await db.from('servicos').update({ nome: srv.nome }).eq('id', srv.id)

console.log('\n-- C3: percentual de repasse --')
const { data: prof } = await db.from('professores').select('id,nome,percentual_repasse').limit(1).single()
await p.goto(`${BASE}/cadastros/professores/${prof.id}`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
const novoPct = Number(prof.percentual_repasse) === 60 ? '55' : '60'
await p.getByLabel('Percentual de repasse (%)').fill(novoPct)
await p.getByRole('button', { name: 'Salvar' }).click()
await p.waitForTimeout(4000)
ck('salvar percentual sem "permission denied"', !(await p.locator('body').innerText()).includes('permission denied'))
const { data: conf } = await db.from('professores').select('percentual_repasse').eq('id', prof.id).single()
ck('percentual gravou no banco', Number(conf.percentual_repasse) === Number(novoPct), String(conf.percentual_repasse))
await db.from('professores').update({ percentual_repasse: prof.percentual_repasse }).eq('id', prof.id)

console.log('\n-- C2: exclusao e anonimizacao (LGPD) --')
const { data: novo } = await db
  .from('responsaveis')
  .insert({ nome: 'QA Excluir Teste', telefone: '(19) 90000-0000' })
  .select('id')
  .single()

await p.goto(`${BASE}/cadastros/responsaveis/${novo.id}`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
ck('botao de excluir existe', await p.getByRole('button', { name: 'Excluir cadastro' }).isVisible())
await p.getByRole('button', { name: 'Excluir cadastro' }).click()
await p.waitForSelector('[role="dialog"]', { timeout: 20000 })
ck('avisa que vai apagar de vez (sem vinculo)', (await p.locator('[role="dialog"]').innerText()).includes('apagado de vez'))
await p.getByRole('button', { name: 'Sim, excluir' }).click()
await p.waitForTimeout(4000)
const { data: sumiu } = await db.from('responsaveis').select('id').eq('id', novo.id)
ck('cadastro sem vinculo foi apagado', sumiu.length === 0)

const { data: comCob } = await db.from('cobrancas').select('responsavel_id').limit(1).single()
await p.goto(`${BASE}/cadastros/responsaveis/${comCob.responsavel_id}`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
await p.getByRole('button', { name: 'Excluir cadastro' }).click()
await p.waitForSelector('[role="dialog"]', { timeout: 20000 })
const dlg2 = await p.locator('[role="dialog"]').innerText()
ck('com cobranca vinculada, oferece anonimizar', dlg2.includes('Anonimizar') && dlg2.includes('financeiro'))
ck('explica que o historico e preservado', dlg2.includes('preservado'))

console.log('\n-- Escola tambem ganhou endereco por CEP (Secao 5 do QA) --')
await p.goto(`${BASE}/cadastros/escolas/novo`, { waitUntil: 'domcontentloaded' })
await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
const formEscola = await p.locator('form.max-w-2xl').innerText()
ck('escola tem CEP e bairro', formEscola.includes('CEP') && formEscola.includes('Bairro'))
ck('escola nao tem mais seletor de cidade', (await p.locator('form select').count()) === 0)

if (errosJs.length) console.log(`\n  ERROS DE JAVASCRIPT: ${errosJs.slice(0, 2).join(' | ').slice(0, 160)}`)
console.log(falhas === 0 ? '\n  Todos os itens do QA conferidos.' : `\n  ${falhas} item(ns) com falha.`)
await nav.close()
process.exit(falhas ? 1 : 0)
