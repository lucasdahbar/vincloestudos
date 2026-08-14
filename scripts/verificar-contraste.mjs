/**
 * Audita o contraste da paleta contra a WCAG 2.1 AA.
 *
 * Le os tokens direto de `src/app/globals.css`, entao nunca diverge do que o
 * sistema realmente usa. Contraste e matematica, nao opiniao: da para verificar
 * sem abrir o navegador.
 *
 * Uso: node scripts/verificar-contraste.mjs
 */
import { readFileSync } from 'node:fs'

const css = readFileSync('src/app/globals.css', 'utf8')
const T = Object.fromEntries(
  [...css.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
)

const luminancia = (hex) => {
  const canais = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2]
}

const razao = (a, b) => {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

/**
 * Cada par e um uso real da interface. `min` e 4.5 para texto normal e 3 para
 * texto grande ou componente de UI (WCAG 1.4.3 e 1.4.11).
 */
const PARES = [
  ['tinta', 'fundo', 'texto do corpo', 4.5],
  ['tinta', 'superficie', 'texto em cartão', 4.5],
  ['tinta-suave', 'fundo', 'texto secundário', 4.5],
  ['tinta-suave', 'superficie', 'secundário em cartão', 4.5],
  ['tinta-suave', 'superficie-2', 'secundário em cabeçalho', 4.5],
  ['tinta-tenue', 'superficie', 'rótulo de seção (texto pequeno)', 3],
  ['destaque', 'fundo', 'link', 4.5],
  ['destaque', 'superficie', 'link em cartão', 4.5],
  ['superficie', 'destaque', 'texto do botão primário', 4.5],
  ['destaque-forte', 'destaque-suave', 'selo neutro', 4.5],
  ['apoio', 'apoio-suave', 'selo ativo', 4.5],
  ['apoio', 'superficie', 'texto de apoio', 4.5],
  ['superficie', 'apoio', 'botão Presente', 4.5],
  ['alerta', 'alerta-suave', 'selo de alerta', 4.5],
  ['alerta', 'superficie', 'texto de alerta', 4.5],
  ['superficie', 'alerta', 'botão Faltou', 4.5],
  ['erro', 'erro-suave', 'mensagem de erro', 4.5],
  ['erro', 'superficie', 'erro em cartão', 4.5],
  ['borda-campo', 'superficie', 'borda de campo (componente de UI)', 3],
]

let falhas = 0
console.log('uso                                      razão   mínimo')
console.log('─'.repeat(62))

for (const [frente, fundo, descricao, minimo] of PARES) {
  if (!T[frente] || !T[fundo]) {
    console.log(`?      ${descricao}: token ausente (${frente} ou ${fundo})`)
    falhas++
    continue
  }
  const r = razao(T[frente], T[fundo])
  const passa = r >= minimo
  if (!passa) falhas++
  console.log(
    `${passa ? 'ok   ' : 'FALHA'}  ${descricao.padEnd(34)} ${r.toFixed(2).padStart(5)}   ${minimo}`,
  )
}

console.log('─'.repeat(62))
console.log(
  falhas === 0
    ? `Todos os ${PARES.length} pares passam na WCAG 2.1 AA.`
    : `${falhas} par(es) reprovado(s).`,
)
process.exit(falhas > 0 ? 1 : 0)
