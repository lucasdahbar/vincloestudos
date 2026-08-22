/**
 * Verifica a gaveta de navegacao do celular.
 *
 * A gestora reportou o menu "cortado": o ultimo item aparecia fatiado na borda
 * e a tela parecia quebrada. Ele rolava, mas nada indicava isso.
 *
 * Uso: node scripts/verificar-gaveta.mjs   |   BASE=https://... node ...
 */
import { readFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const BASE = process.env.BASE ?? 'http://localhost:3000'
const TELAS = [
  [360, 640, 'celular pequeno'],
  [390, 844, 'iPhone comum'],
  [478, 885, 'tela do print da gestora'],
]

let falhas = 0
const ck = (r, ok, x = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${r}${x ? ` — ${x}` : ''}`)
  if (!ok) falhas++
}

const nav = await chromium.launch()

for (const [w, h, rotulo] of TELAS) {
  const ctx = await nav.newContext({ ...devices['iPhone 13'], viewport: { width: w, height: h } })
  const p = await ctx.newPage()

  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name="email"]', 'gestora@mesinharedonda.app')
  await p.fill('input[name="senha"]', env.SENHA_TESTE)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 25000 })

  await p.goto(`${BASE}/cadastros/feriados`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2000)
  await p.locator('header button[aria-controls="menu-completo"]').click()
  await p.waitForSelector('#menu-completo', { state: 'visible', timeout: 10000 })
  await p.waitForTimeout(800)

  console.log(`\n${rotulo} (${w}x${h}):`)

  const m = await p.evaluate(() => {
    const g = document.querySelector('#menu-completo')
    const r = g.getBoundingClientRect()
    const links = [...g.querySelectorAll('a')]
    return {
      fundo: Math.round(r.bottom),
      tela: window.innerHeight,
      rolavel: g.scrollHeight > g.clientHeight + 2,
      itens: links.length,
      // Item cortado: comeca dentro da area visivel mas termina fora.
      cortados: links.filter((a) => {
        const b = a.getBoundingClientRect()
        return b.top < r.bottom && b.bottom > r.bottom + 1
      }).length,
    }
  })

  ck('gaveta não passa da tela', m.fundo <= m.tela + 1, `fundo ${m.fundo} / tela ${m.tela}`)
  ck('todos os destinos presentes', m.itens === 18, `${m.itens} itens`)

  if (m.rolavel) {
    const temSombra = await p.evaluate(() => {
      const g = document.querySelector('#menu-completo')
      return [...g.querySelectorAll('div')].some(
        (d) =>
          getComputedStyle(d).position === 'sticky' &&
          getComputedStyle(d).backgroundImage.includes('gradient'),
      )
    })
    ck('há sombra indicando que rola', temSombra)
  } else {
    ck('coube inteira, sem precisar rolar', true)
  }

  // O que importa no fim: dá para chegar no último item e clicar nele.
  await p.evaluate(() => {
    const g = document.querySelector('#menu-completo')
    g.scrollTop = g.scrollHeight
  })
  await p.waitForTimeout(500)

  const ultimo = await p.evaluate(() => {
    const g = document.querySelector('#menu-completo')
    const links = [...g.querySelectorAll('a')]
    const u = links[links.length - 1]
    const b = u.getBoundingClientRect()
    const r = g.getBoundingClientRect()
    const meio = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return {
      texto: u.textContent.trim(),
      inteiro: b.bottom <= r.bottom + 1 && b.top >= r.top - 1,
      clicavel: Boolean(meio && meio.closest('a') === u),
    }
  })

  ck(`último item "${ultimo.texto}" aparece inteiro`, ultimo.inteiro)
  ck('e recebe o clique', ultimo.clicavel)

  await ctx.close()
}

console.log(falhas === 0 ? '\n  Gaveta ok em todas as telas.' : `\n  ${falhas} falha(s).`)
await nav.close()
process.exit(falhas ? 1 : 0)
