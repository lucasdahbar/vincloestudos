/**
 * ATENCAO: o banco tem os dados REAIS da gestora, nao mais o seed. Por isso as
 * verificacoes conferem a ESTRUTURA da tela (titulos, rotulos, colunas) e nao
 * nomes de registro — que mudam conforme ela usa o sistema. E nunca rode
 * `scripts/semear.mjs` contra este banco: ele apaga os dados dela.
 *
 * Verificacao ponta a ponta: faz login de verdade, monta o cookie de sessao no
 * formato que o @supabase/ssr espera, e busca as paginas protegidas conferindo
 * que o conteudo real do banco aparece no HTML renderizado.
 *
 * HTTP 307 para /login so prova que a rota existe. Isto prova que ela funciona.
 */
import { readFileSync } from 'node:fs'

const RAIZ = process.cwd()
const BASE = process.env.BASE ?? 'http://localhost:3000'

const env = Object.fromEntries(
  readFileSync(`${RAIZ}/.env.local`, 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ref = new URL(url).hostname.split('.')[0]

// 1. Login pela API de auth, para obter a sessao.
const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'gestora@mesinharedonda.app',
    password: env.SENHA_TESTE,
  }),
})

const sessao = await resp.json()
if (!sessao.access_token) {
  console.error('LOGIN FALHOU:', JSON.stringify(sessao))
  process.exit(1)
}
console.log(`login: ok (usuario ${sessao.user.email})`)

// 2. O @supabase/ssr guarda a sessao como base64 de um JSON, possivelmente
//    fatiada em varios cookies numerados. Um payload so cabe em um cookie.
const payload = Buffer.from(
  JSON.stringify({
    access_token: sessao.access_token,
    token_type: 'bearer',
    expires_in: sessao.expires_in,
    expires_at: sessao.expires_at,
    refresh_token: sessao.refresh_token,
    user: sessao.user,
  }),
).toString('base64')

const bruto = `sb-${ref}-auth-token=base64-${payload}`
const partes = []
const TAM = 3180
if (bruto.length > TAM) {
  const valor = `base64-${payload}`
  for (let i = 0, n = 0; i < valor.length; i += TAM, n++) {
    partes.push(`sb-${ref}-auth-token.${n}=${valor.slice(i, i + TAM)}`)
  }
} else {
  partes.push(bruto)
}
const cookie = partes.join('; ')

// 3. Buscar cada pagina protegida e conferir que o dado do banco aparece.
const CASOS = [
  ['/cadastros/responsaveis', ['Responsáveis', 'Nov'], 'lista de responsáveis'],
  ['/cadastros/alunos', ['Alunos', 'Responsável'], 'alunos com a coluna de responsável'],
  ['/cadastros/professores', ['Professores', '%'], 'professores com percentual'],
  ['/cadastros/servicos', ['Serviços', 'R$'], 'serviços com valor em reais'],
  ['/cadastros/feriados', ['Feriados'], 'feriados'],
  ['/cadastros/contas', ['Contas'], 'contas'],
  ['/cadastros/materias', ['Matérias'], 'matérias'],
  ['/cadastros/anos-escolares', ['Anos escolares'], 'anos escolares'],
  ['/cadastros/escolas', ['Escolas'], 'escolas'],
  ['/cadastros/responsaveis/novo', ['CEP', 'Logradouro', 'Bairro', 'Estado (UF)'], 'endereço por CEP (QA M3/M4)'],
  ['/cadastros/escolas/novo', ['CEP', 'Bairro'], 'escola com endereço por CEP (QA C1)'],
  ['/turmas', ['Turmas'], 'turmas'],
  ['/matriculas', ['Matrículas'], 'matrículas'],
  ['/turmas/nova', ['Nome da turma', 'gerado automaticamente', 'Serviço'], 'formulário de turma'],
  ['/matriculas/nova', ['Matrícula de reposição'], 'formulário de matrícula'],
  ['/agenda', ['Dom', 'Seg', 'Ter'], 'agenda em calendário'],
  ['/agenda?vista=semana', ['Semana', 'Mês'], 'agenda por semana'],
  ['/reposicoes', ['Reposições'], 'painel de reposições'],
  ['/cobrancas', ['Cobranças', 'Gerar cobranças'], 'cobranças'],
  ['/recebimentos', ['Recebimentos'], 'recebimentos'],
  ['/pagamentos', ['Pagamentos a professores'], 'pagamentos'],
  ['/mensagens', ['Mensagens a enviar'], 'fila de mensagens'],
  ['/', ['Olá', 'Aulas de hoje'], 'painel inicial'],
]

let ok = 0
let falhas = 0

for (const [rota, esperados, descricao] of CASOS) {
  const r = await fetch(`${BASE}${rota}`, { headers: { cookie }, redirect: 'manual' })
  const html = r.status === 200 ? await r.text() : ''
  const faltando = esperados.filter((e) => !html.includes(e))

  if (r.status === 200 && faltando.length === 0) {
    console.log(`  OK   ${rota.padEnd(32)} ${descricao}`)
    ok++
  } else {
    console.log(
      `  FALHA ${rota.padEnd(31)} status=${r.status}` +
        (faltando.length ? ` faltou no HTML: ${JSON.stringify(faltando)}` : ''),
    )
    falhas++
  }
}

// 4. Cadastro inexistente mostra a pagina de "nao encontrado", em portugues.
//
// O status HTTP e 200 e nao 404 porque a rota tem `loading.tsx`: o Next comeca
// a resposta com o esqueleto — dai o 200 — e o conteudo final chega em seguida
// por streaming. O que importa para a usuaria e o que ela le na tela.
const r404 = await fetch(`${BASE}/cadastros/naoexiste`, { headers: { cookie } })
const html404 = await r404.text()
const mostraNaoEncontrada = html404.includes('Esta página não existe')

if (mostraNaoEncontrada) {
  console.log(`  OK   ${'/cadastros/naoexiste'.padEnd(32)} mostra "não encontrado" em português`)
  ok++
} else {
  console.log(`  FALHA /cadastros/naoexiste status=${r404.status}, sem a página de não encontrado`)
  falhas++
}

console.log(`\n${ok} ok, ${falhas} falha(s)`)
process.exit(falhas > 0 ? 1 : 0)
