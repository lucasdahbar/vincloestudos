/**
 * Mede o layout do celular num navegador de verdade.
 *
 * A versao anterior analisava o HTML e passava em tudo — nao pegou o bug que
 * quebrou a navegacao: um `truncate` em elemento inline esticava ate 538px, o
 * documento ia a 631px, o navegador encolhia a pagina para caber e a barra de
 * navegacao fixa saia da tela. So medindo no navegador isso aparece.
 *
 * O sinal decisivo e `innerHeight > visualViewport.height`: significa que o
 * navegador diminuiu o zoom por causa de conteudo largo demais.
 *
 * Uso: node scripts/verificar-mobile.mjs [largura] [altura]
 *      BASE=https://... node scripts/verificar-mobile.mjs
 */
import { readFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const LARGURA = Number(process.argv[2] ?? 390)
const ALTURA = Number(process.argv[3] ?? 844)
const BASE = process.env.BASE ?? 'http://localhost:3000'

const ROTAS = [
  '/',
  '/agenda',
  '/agenda?vista=semana',
  '/turmas',
  '/turmas/nova',
  '/matriculas',
  '/matriculas/nova',
  '/reposicoes',
  '/cobrancas',
  '/recebimentos',
  '/pagamentos',
  '/cadastros/alunos',
  '/cadastros/responsaveis',
  '/cadastros/servicos',
  '/cadastros/alunos/2',
  '/matriculas/3',
  '/cadastros/recessos',
  '/cadastros/integracoes',
]

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  ...devices['iPhone 13'],
  viewport: { width: LARGURA, height: ALTURA },
})
const pagina = await contexto.newPage()

const erros = []
pagina.on('pageerror', (e) => erros.push(e.message))

await pagina.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await pagina.fill('input[name="email"]', 'gestora@mesinharedonda.app')
await pagina.fill('input[name="senha"]', env.SENHA_TESTE)
await pagina.click('button[type="submit"]')
await pagina.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 })

console.log(`Tela ${LARGURA}x${ALTURA} — ${BASE}\n`)
let problemas = 0

for (const rota of ROTAS) {
  await pagina.goto(BASE + rota, { waitUntil: 'networkidle' })

  const m = await pagina.evaluate(() => {
    // A barra inferior some a partir de md, quando a lateral assume.
    const barra = [...document.querySelectorAll('nav[aria-label="Navegação principal"]')]
      .filter((n) => getComputedStyle(n).display !== 'none')
      .pop()
    const barraFixa = barra && getComputedStyle(barra).position === 'fixed'
    const caixa = barraFixa ? barra.getBoundingClientRect() : null

    // Elementos que ultrapassam a largura da tela.
    const largos = []
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect()
      if (b.width > window.visualViewport.width + 1 && getComputedStyle(el).display !== 'none') {
        const classe = typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : ''
        largos.push(`${el.tagName.toLowerCase()}.${classe} = ${Math.round(b.width)}px`)
      }
    }

    return {
      docW: document.documentElement.scrollWidth,
      telaW: window.visualViewport.width,
      innerH: window.innerHeight,
      visualH: Math.round(window.visualViewport.height),
      barraFim: caixa ? Math.round(caixa.bottom) : null,
      largos: [...new Set(largos)].slice(0, 4),
    }
  })

  const achados = []
  // Zoom automatico: a pagina foi encolhida para caber conteudo largo.
  if (m.innerH > m.visualH + 1) {
    achados.push(`navegador encolheu a página (viewport ${m.innerH}px em vez de ${m.visualH}px)`)
  }
  if (m.docW > m.telaW + 1) achados.push(`documento com ${m.docW}px, tela tem ${m.telaW}px`)
  if (m.barraFim !== null && Math.abs(m.barraFim - ALTURA) > 4) {
    achados.push(`barra de navegação termina em ${m.barraFim}, deveria ser ${ALTURA}`)
  }
  m.largos.forEach((l) => achados.push(`largo demais: ${l}`))

  if (achados.length) {
    problemas += achados.length
    console.log(`FALHA ${rota}`)
    achados.forEach((a) => console.log(`        ${a}`))
  } else {
    console.log(`ok    ${rota}`)
  }
}

if (erros.length) {
  console.log(`\nERROS DE JAVASCRIPT (${erros.length}):`)
  erros.slice(0, 5).forEach((e) => console.log(`  ${e.slice(0, 150)}`))
}

console.log(
  problemas === 0
    ? `\nAs ${ROTAS.length} rotas cabem em ${LARGURA}px, sem zoom automático e com a barra no lugar.`
    : `\n${problemas} problema(s).`,
)

await navegador.close()
process.exit(problemas > 0 || erros.length > 0 ? 1 : 0)
