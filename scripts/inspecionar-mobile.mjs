/**
 * Abre o sistema num navegador de verdade, em tela de celular, e mede o que
 * so da para saber renderizando: se a barra de navegacao esta visivel, se ela
 * e clicavel, se a navegacao funciona e se a pagina rola de lado.
 *
 * Uso: node scripts/inspecionar-mobile.mjs [largura] [altura]
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const LARGURA = Number(process.argv[2] ?? 390)
const ALTURA = Number(process.argv[3] ?? 844)
const BASE = process.env.BASE ?? 'http://localhost:3000'
const SAIDA = 'capturas'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

mkdirSync(SAIDA, { recursive: true })

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  ...devices['iPhone 13'],
  viewport: { width: LARGURA, height: ALTURA },
})
const pagina = await contexto.newPage()

const erros = []
pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
pagina.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`))

// Login pela propria tela, como a usuaria faria.
await pagina.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await pagina.fill('input[name="email"]', 'gestora@mesinharedonda.app')
await pagina.fill('input[name="senha"]', env.SENHA_TESTE)
await pagina.click('button[type="submit"]')
await pagina.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 })
await pagina.waitForLoadState('networkidle')

console.log(`Tela ${LARGURA}x${ALTURA} — ${BASE}\n`)

const ck = (rotulo, ok, extra = '') =>
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? ` — ${extra}` : ''}`)

// 1. A barra inferior existe, esta visivel e dentro da tela?
const barra = pagina.locator('nav[aria-label="Navegação principal"]').last()
const visivel = await barra.isVisible()
const caixa = await barra.boundingBox()
ck('barra inferior visível', visivel)
if (caixa) {
  console.log(
    `        posição: y=${Math.round(caixa.y)} altura=${Math.round(caixa.height)} (tela tem ${ALTURA})`,
  )
  ck('barra dentro da tela', caixa.y + caixa.height <= ALTURA + 1, `fim em ${Math.round(caixa.y + caixa.height)}`)
}

// 2. Rolagem horizontal?
const larguraDoc = await pagina.evaluate(() => document.documentElement.scrollWidth)
ck('sem rolagem horizontal', larguraDoc <= LARGURA + 1, `conteúdo tem ${larguraDoc}px`)

// 3. O que esta REALMENTE no topo de cada botao da barra?
const itens = await barra.locator('a, button').all()
console.log(`\n  ${itens.length} alvos na barra:`)
for (const item of itens) {
  const texto = (await item.innerText()).trim()
  const b = await item.boundingBox()
  if (!b) {
    console.log(`    "${texto}": sem caixa`)
    continue
  }
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const emCima = await pagina.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return 'nada'
      const alvo = el.closest('a, button')
      return alvo
        ? `${alvo.tagName.toLowerCase()} "${(alvo.textContent || '').trim().slice(0, 14)}"`
        : `${el.tagName.toLowerCase()} bloqueando`
    },
    [cx, cy],
  )
  const clicavel = emCima.includes(texto.slice(0, 8))
  console.log(
    `    ${clicavel ? 'ok   ' : 'FALHA'} "${texto}" ${Math.round(b.width)}x${Math.round(b.height)}px → recebe clique: ${emCima}`,
  )
}

await pagina.screenshot({ path: `${SAIDA}/celular-inicio.png`, fullPage: false })

// 4. Navegar de verdade, clicando.
console.log('\n  navegação por clique:')
for (const [rotulo, esperado] of [
  ['Agenda', '/agenda'],
  ['Turmas', '/turmas'],
  ['Cobranças', '/cobrancas'],
  ['Início', '/'],
]) {
  try {
    // Re-localiza a cada volta: navegar troca a arvore e invalida o locator.
    const atual = pagina.locator('nav[aria-label="Navegação principal"]').last()
    await atual.getByRole('link', { name: rotulo, exact: true }).click({ timeout: 8000 })
    await pagina.waitForURL(`**${esperado}`, { timeout: 12000 })
    ck(`clicar em "${rotulo}"`, true, `chegou em ${new URL(pagina.url()).pathname}`)
  } catch (e) {
    ck(`clicar em "${rotulo}"`, false, String(e).split('\n')[0].slice(0, 90))
  }
}

// 5. A gaveta "Menu" abre?
try {
  const atual = pagina.locator('nav[aria-label="Navegação principal"]').last()
  await atual.getByRole('button', { name: 'Menu' }).click({ timeout: 8000 })
  await pagina.waitForSelector('#menu-completo', { state: 'visible', timeout: 8000 })
  const links = await pagina.locator('#menu-completo a').count()
  ck('gaveta "Menu" abre', true, `${links} destinos`)
  await pagina.screenshot({ path: `${SAIDA}/celular-menu.png` })
} catch (e) {
  ck('gaveta "Menu" abre', false, String(e).split('\n')[0].slice(0, 90))
}

console.log(
  erros.length ? `\n  ERROS DE CONSOLE (${erros.length}):` : '\n  console limpo',
)
erros.slice(0, 5).forEach((e) => console.log(`    ${e.slice(0, 160)}`))

console.log(`\n  capturas em ${SAIDA}/`)
await navegador.close()
