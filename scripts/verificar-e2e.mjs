/**
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
    password: 'mesinha123',
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
  ['/', ['Gestora'], 'painel inicial'],
  ['/cadastros/responsaveis', ['Ana Ribeiro', 'Marcos Tavares', 'Juliana Prado'], 'lista de responsaveis'],
  ['/cadastros/alunos', ['João Ribeiro', 'Maria Ribeiro', 'Colégio São José'], 'alunos com escola resolvida (join)'],
  ['/cadastros/professores', ['Beatriz Lima', 'Carlos Menezes', '60%'], 'professores com percentual formatado'],
  ['/cadastros/servicos', ['Aula regular', 'R$', '100,00'], 'servicos com dinheiro formatado'],
  ['/cadastros/feriados', ['Independência do Brasil', '07/09/2026'], 'feriados com data em DD/MM/AAAA'],
  ['/cadastros/cidades', ['Campinas', 'Valinhos'], 'cidades'],
  ['/cadastros/contas', ['Conta principal', 'Nubank'], 'contas'],
  ['/cadastros/materias', ['Matemática', 'Português'], 'materias'],
  ['/cadastros/anos-escolares', ['9º ano'], 'anos escolares'],
  ['/cadastros/escolas', ['Colégio São José', 'Campinas'], 'escolas com cidade resolvida'],
  ['/turmas', ['Matemática', '9º ano', 'Beatriz Lima', 'aluno'], 'turmas com professor e contagem'],
  ['/matriculas', ['João Ribeiro', 'Ativa'], 'matriculas'],
  ['/cadastros/professores/2', ['Beatriz Lima', 'Turmas deste professor'], 'NAVEGACAO CRUZADA: turmas do professor'],
  ['/cadastros/alunos/2', ['João Ribeiro', 'Turmas e matrículas'], 'NAVEGACAO CRUZADA: matriculas do aluno'],
  ['/cadastros/responsaveis/2', ['Ana Ribeiro', 'Alunos sob responsabilidade', 'Maria Ribeiro'], 'NAVEGACAO CRUZADA: filhos do responsavel'],
  ['/turmas/nova', ['Nome da turma', 'gerado automaticamente', 'Serviço'], 'formulario de turma'],
  ['/matriculas/nova', ['Matrícula de reposição'], 'formulario de matricula'],
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

// 4. A rota de cadastro inexistente deve dar 404, mesmo com sessao valida.
const r404 = await fetch(`${BASE}/cadastros/naoexiste`, { headers: { cookie }, redirect: 'manual' })
if (r404.status === 404) {
  console.log(`  OK   ${'/cadastros/naoexiste'.padEnd(32)} 404 com sessao valida`)
  ok++
} else {
  console.log(`  FALHA /cadastros/naoexiste status=${r404.status}, esperado 404`)
  falhas++
}

console.log(`\n${ok} ok, ${falhas} falha(s)`)
process.exit(falhas > 0 ? 1 : 0)
