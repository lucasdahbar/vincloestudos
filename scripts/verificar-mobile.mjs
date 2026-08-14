/**
 * Procura o que quebra o layout em tela de celular.
 *
 * Sem navegador nao da para medir pixel, mas da para achar as causas mais
 * comuns de rolagem horizontal analisando as classes do HTML renderizado:
 * largura minima maior que a tela, grade de muitas colunas sem ponto de
 * quebra, e tabela sem alternativa em cartao.
 *
 * Uso: node scripts/verificar-mobile.mjs [largura]
 */
import { readFileSync } from 'node:fs'

const LARGURA = Number(process.argv[2] ?? 375)
const BASE = process.env.BASE ?? 'http://localhost:3000'
const REM = 16

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ref = new URL(url).hostname.split('.')[0]

const sessao = await (
  await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gestora@mesinharedonda.app', password: 'mesinha123' }),
  })
).json()

if (!sessao.access_token) {
  console.error('login falhou')
  process.exit(1)
}

const valor =
  'base64-' +
  Buffer.from(
    JSON.stringify({
      access_token: sessao.access_token,
      token_type: 'bearer',
      expires_in: sessao.expires_in,
      expires_at: sessao.expires_at,
      refresh_token: sessao.refresh_token,
      user: sessao.user,
    }),
  ).toString('base64')

const TAM = 3180
const partes = []
if (valor.length > TAM) {
  for (let i = 0, n = 0; i < valor.length; i += TAM, n++) {
    partes.push(`sb-${ref}-auth-token.${n}=${valor.slice(i, i + TAM)}`)
  }
} else {
  partes.push(`sb-${ref}-auth-token=${valor}`)
}
const cookie = partes.join('; ')

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
]

/** Classe que vale no celular: sem prefixo, ou com prefixo menor que sm. */
function valeNoCelular(classe) {
  return !/^(sm|md|lg|xl|2xl):/.test(classe)
}

/**
 * Corta as subárvores marcadas como `hidden ... sm:block|flex|grid`: elas não
 * são pintadas no celular, logo não empurram o layout. Conta a profundidade das
 * tags para achar o fechamento certo — regex sozinha erra com aninhamento, e
 * a grade do mês e a da semana viravam falso positivo.
 */
function removerEscondidos(html) {
  const abertura = /<(div|ul|table)\b[^>]*class="[^"]*\bhidden\b[^"]*\bsm:(?:block|flex|grid|table)\b[^"]*"[^>]*>/
  let saida = html
  let guarda = 0

  while (guarda++ < 50) {
    const m = abertura.exec(saida)
    if (!m) break

    const tag = m[1]
    let i = m.index + m[0].length
    let nivel = 1
    const passo = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g')
    passo.lastIndex = i

    let achou
    while (nivel > 0 && (achou = passo.exec(saida))) {
      nivel += achou[0].startsWith('</') ? -1 : 1
      i = passo.lastIndex
    }

    saida = saida.slice(0, m.index) + saida.slice(i)
  }

  return saida
}

let problemas = 0

for (const rota of ROTAS) {
  const resp = await fetch(`${BASE}${rota}`, { headers: { cookie } })
  if (resp.status !== 200) {
    console.log(`FALHA ${rota} -> HTTP ${resp.status}`)
    problemas++
    continue
  }

  // Só o HTML renderizado; o payload do React repete classes e polui a análise.
  let html = (await resp.text()).split('self.__next_f')[0]

  html = removerEscondidos(html)

  const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/))

  const achados = []

  for (const c of new Set(classes)) {
    if (!valeNoCelular(c)) continue

    const minW = c.match(/^min-w-\[([\d.]+)(rem|px)\]$/)
    if (minW) {
      const px = minW[2] === 'rem' ? Number(minW[1]) * REM : Number(minW[1])
      if (px > LARGURA) achados.push(`${c} = ${px}px, maior que a tela`)
    }

    const w = c.match(/^w-\[([\d.]+)(rem|px)\]$/)
    if (w) {
      const px = w[2] === 'rem' ? Number(w[1]) * REM : Number(w[1])
      if (px > LARGURA) achados.push(`${c} = ${px}px, maior que a tela`)
    }

    const cols = c.match(/^grid-cols-(\d+)$/)
    // Até 2 colunas cabe em 375px; 3 ou mais espreme demais.
    if (cols && Number(cols[1]) > 2) achados.push(`${c} sem ponto de quebra`)
  }

  // Tabela precisa de alternativa em cartão: ou some no celular, ou não existe.
  const temTabela = html.includes('<table')
  const tabelaEscondida = /class="[^"]*hidden[^"]*sm:block[^"]*"/.test(html)
  if (temTabela && !tabelaEscondida) {
    achados.push('tabela visível no celular, sem alternativa em cartão')
  }

  if (achados.length) {
    problemas += achados.length
    console.log(`\nFALHA ${rota}`)
    achados.forEach((a) => console.log(`        ${a}`))
  } else {
    console.log(`ok    ${rota}`)
  }
}

console.log(
  problemas === 0
    ? `\nNenhum risco de rolagem horizontal a ${LARGURA}px nas ${ROTAS.length} rotas.`
    : `\n${problemas} problema(s) a ${LARGURA}px.`,
)
process.exit(problemas > 0 ? 1 : 0)
