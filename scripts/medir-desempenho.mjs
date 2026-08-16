/**
 * Mede o tempo real de cada tela, num navegador.
 *
 * Separa o que e servidor (TTFB — o tempo ate o primeiro byte, dominado pelas
 * consultas ao banco) do que e cliente (renderizacao), porque a correcao e
 * diferente em cada caso.
 *
 * Uso: node scripts/medir-desempenho.mjs
 *      BASE=https://... node scripts/medir-desempenho.mjs
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
const VOLTAS = Number(process.env.VOLTAS ?? 2)

const ROTAS = [
  '/',
  '/agenda',
  '/agenda?vista=semana',
  '/turmas',
  '/matriculas',
  '/reposicoes',
  '/cobrancas',
  '/cobrancas/1',
  '/recebimentos',
  '/pagamentos',
  '/cadastros/alunos',
  '/cadastros/alunos/2',
  '/cadastros/servicos',
]

const navegador = await chromium.launch()
const contexto = await navegador.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
const pagina = await contexto.newPage()

await pagina.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await pagina.fill('input[name="email"]', 'gestora@mesinharedonda.app')
await pagina.fill('input[name="senha"]', env.SENHA_TESTE)
await pagina.click('button[type="submit"]')
await pagina.waitForURL((u) => !u.pathname.includes('login'), { timeout: 25000 })

console.log(`${BASE} — mediana de ${VOLTAS} medições\n`)
console.log('rota                        TTFB    carga   total')
console.log('─'.repeat(56))

const mediana = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)]
const resultados = []

for (const rota of ROTAS) {
  const ttfbs = []
  const totais = []

  for (let i = 0; i < VOLTAS; i++) {
    await pagina.goto(BASE + rota, { waitUntil: 'load' })
    const t = await pagina.evaluate(() => {
      const n = performance.getEntriesByType('navigation')[0]
      return n ? { ttfb: n.responseStart - n.requestStart, total: n.duration } : null
    })
    if (t) {
      ttfbs.push(t.ttfb)
      totais.push(t.total)
    }
  }

  const ttfb = Math.round(mediana(ttfbs))
  const total = Math.round(mediana(totais))
  resultados.push({ rota, ttfb, total })

  const marca = ttfb > 1500 ? ' <<< lento' : ttfb > 800 ? ' <<' : ''
  console.log(
    `${rota.padEnd(26)} ${String(ttfb).padStart(5)}ms ${String(total - ttfb).padStart(5)}ms ${String(total).padStart(5)}ms${marca}`,
  )
}

console.log('─'.repeat(56))
const piores = resultados.slice().sort((a, b) => b.ttfb - a.ttfb).slice(0, 3)
console.log('\nMaior tempo de servidor (consultas ao banco):')
piores.forEach((r) => console.log(`  ${r.ttfb}ms  ${r.rota}`))

await navegador.close()
