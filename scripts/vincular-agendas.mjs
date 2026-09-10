/**
 * Cadastra os professores da planilha do Google e vincula a agenda de cada um (G1).
 *
 * O vinculo turma -> professor -> agenda e feito por ID, nunca por nome: o
 * rotulo da agenda no Google ("Aline - Quimica") e independente do nome do
 * cadastro ("Aline Giron ..."), e um mesmo professor pode ter mais de uma
 * agenda na mesma conta. Ver docs/google-agenda.md, passo 7.
 *
 * Cada ID e conferido contra a API do Google ANTES de ir para o banco. Um ID
 * errado nao da erro na hora: a turma salva e o evento simplesmente nao
 * aparece, que e o tipo de falha dificil de perceber.
 *
 * Casa pelo e-mail do professor, entao rodar duas vezes nao duplica ninguem.
 *
 * Uso:
 *   node scripts/vincular-agendas.mjs --ensaio   # so mostra o que faria
 *   node scripts/vincular-agendas.mjs            # grava
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function carregarEnv(caminho = '.env.local') {
  const env = {}
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = carregarEnv()
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const ENSAIO = process.argv.includes('--ensaio')

/**
 * Os professores e suas agendas.
 *
 * `nome` e o rotulo da planilha, deliberadamente provisorio: a escola cadastra
 * o nome completo depois, pela tela, e a agenda continua ligada porque o
 * vinculo e por ID. `email` veio da ACL da propria agenda no Google — para
 * Diego e Flavia, que tinham dois, a escola escolheu qual e o de contato.
 *
 * Fora da lista de proposito: "Stephany Chaiben - Quimica" (professora
 * inativa) e "Stephanie (Hist/Geo)" (agenda vazia, duplicata da
 * "Stephanie Geo/Historia" — mesma dona, e a escola vai apagar).
 */
const PROFESSORES = [
  {
    nome: 'Aline - Química',
    email: 'alinegironqui@gmail.com',
    agenda: 'dba28b7224eca2d3dd403ca0c2aa1b150912b2db70e96db5a8df9f89b8e1dbf8@group.calendar.google.com',
  },
  {
    nome: 'Bárbara Rodrigues',
    email: 'profebarbara.rodrigues@gmail.com',
    agenda: '581fb76ea8f2a28096990089aae32960a472df4727f6dae6eb0566b80391987a@group.calendar.google.com',
  },
  {
    nome: 'Diego Delgado - Matemática',
    email: 'monteirodiego.prof@gmail.com',
    agenda: '176662e8dca29148d7dac9cb3566485120aa7ba03e1d1d0d60ce10bea860b5b5@group.calendar.google.com',
  },
  {
    nome: 'Felipe Pamplona - Física',
    email: 'felipe.pamplona94@gmail.com',
    agenda: '9fedc4362ff31e097f5020612c89add632920c27b85fd8339ce690ca4a926ac5@group.calendar.google.com',
  },
  {
    nome: 'Flávia - Português',
    email: 'profeflavitapinheiro@gmail.com',
    agenda: '37db11b2503dca660358177eef6bc33b92569d57b20d0127cad78e28339212c1@group.calendar.google.com',
  },
  {
    nome: 'Isabel - História',
    email: 'mariaisabelfilaretti@gmail.com',
    agenda: '3f8924932b5732a33f22ae603be41c96cd37ceeffcd2db3a4cd578e2ca445f80@group.calendar.google.com',
  },
  {
    nome: 'Jonathan - professor Inglês',
    email: 'jonathanlhf@gmail.com',
    agenda: '2bf4388c4082d059bd20629acd56d85d33bff389a1006ffc3072b7a95130b8ed@group.calendar.google.com',
  },
  {
    nome: 'Luana - Português/Redação',
    email: 'papalardoluana2@gmail.com',
    agenda: 'f9cae9267c1d407f95f678e86b90200f00266d588d8bb122e289ec3231b929f1@group.calendar.google.com',
  },
  {
    nome: 'Luciano Vaz - Biologia',
    email: 'profluciano.vaz@gmail.com',
    agenda: '876587980f54f0a56c87e28a8501de21a88622e98406535b0c3ba8bb7e491317@group.calendar.google.com',
  },
  {
    nome: 'Mylena Ribeiro (Biologia)',
    email: 'myllenaribeiro2@gmail.com',
    agenda: '457b78d14d7a65fc2eecde11335a9861ffb9dcc05fa72dfcb68e8f68a367058b@group.calendar.google.com',
  },
  {
    nome: 'Natália Galdino Muller (Inglês)',
    email: 'ngmletras@gmail.com',
    agenda: '89574df8b743ea72577d48b49b890e515a316ba175dff785dc2d8b43b53850b4@group.calendar.google.com',
  },
  {
    nome: 'Professora Kelly Dahbar',
    email: 'kellydahbar@gmail.com',
    agenda: 'b6400facf0cc80bd7f1d9dbad916b67f3c4b84afe2e913e984dd91a83b4719b5@group.calendar.google.com',
  },
  {
    nome: 'Rafael - Matemática',
    email: 'rafa21marcelino@gmail.com',
    agenda: 'fbadf3c1298361d0c37368351222bbfba37e656f28260b25ad66fcf200e47b9a@group.calendar.google.com',
  },
  {
    nome: 'Stephanie Geo/História',
    email: 'stephaniebucard@gmail.com',
    agenda: '5572496e2b5ff7ad598685d05a54154b65df21b72bd34b6d84005de416d354f2@group.calendar.google.com',
  },
]

/** O mesmo repasse dos professores ja cadastrados; a coluna nao aceita nulo. */
const REPASSE_PADRAO = 50

async function accessToken() {
  const { data } = await db.from('google_oauth').select('refresh_token').eq('id', 1).maybeSingle()
  if (!data?.refresh_token) {
    console.error('O Google Agenda nao foi conectado. Ver docs/google-agenda.md, passo 5.')
    process.exit(1)
  }

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: data.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  })

  const corpo = await resposta.json()
  if (!corpo.access_token) {
    console.error(`Nao foi possivel renovar o acesso: ${corpo.error_description ?? corpo.error}`)
    process.exit(1)
  }
  return corpo.access_token
}

/** A agenda existe e a conta autorizada alcanca ela? */
async function conferirAgenda(id, token) {
  const resposta = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const corpo = await resposta.json()
  return resposta.ok
    ? { ok: true, rotulo: corpo.summary?.trim() }
    : { ok: false, motivo: corpo.error?.message ?? `HTTP ${resposta.status}` }
}

const token = await accessToken()

console.log(`Conferindo ${PROFESSORES.length} agendas no Google...\n`)

const conferidos = []
for (const professor of PROFESSORES) {
  const r = await conferirAgenda(professor.agenda, token)
  if (!r.ok) {
    console.error(`  FALHOU  ${professor.nome}: ${r.motivo}`)
    continue
  }
  console.log(`  ok      ${professor.nome}${r.rotulo === professor.nome ? '' : ` (Google: "${r.rotulo}")`}`)
  conferidos.push(professor)
}

if (conferidos.length !== PROFESSORES.length) {
  console.error(
    `\n${PROFESSORES.length - conferidos.length} agenda(s) nao responderam. Nada foi gravado.`,
  )
  process.exit(1)
}

// Casa pelo e-mail: e o unico dado estavel entre a planilha e o cadastro. O
// nome nao serve — a escola vai troca-lo pelo nome completo.
const { data: existentes, error } = await db.from('professores').select('id, nome, email')
if (error) {
  console.error(`Falha ao ler os professores: ${error.message}`)
  process.exit(1)
}

const porEmail = new Map(
  (existentes ?? []).filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]),
)

const criar = []
const atualizar = []
for (const professor of conferidos) {
  const jaExiste = porEmail.get(professor.email.toLowerCase())
  if (jaExiste) atualizar.push({ ...professor, id: jaExiste.id, nomeAtual: jaExiste.nome })
  else criar.push(professor)
}

console.log(`\n${criar.length} para cadastrar, ${atualizar.length} ja cadastrado(s).`)

if (ENSAIO) {
  for (const p of criar) console.log(`  cadastraria  ${p.nome} <${p.email}>`)
  for (const p of atualizar) console.log(`  vincularia   ${p.nomeAtual} <${p.email}>`)
  console.log('\nEnsaio: nada foi gravado.')
  process.exit(0)
}

if (criar.length) {
  const { error } = await db.from('professores').insert(
    criar.map((p) => ({
      nome: p.nome,
      email: p.email,
      google_calendar_id: p.agenda,
      percentual_repasse: REPASSE_PADRAO,
      ativo: true,
    })),
  )
  if (error) {
    console.error(`Falha ao cadastrar: ${error.message}`)
    process.exit(1)
  }
  console.log(`  cadastrados: ${criar.length}`)
}

// Toca so a agenda: nome, telefone e Pix sao da escola, e sobrescrever aqui
// apagaria o que ela ja ajustou pela tela.
for (const p of atualizar) {
  const { error } = await db
    .from('professores')
    .update({ google_calendar_id: p.agenda })
    .eq('id', p.id)
  if (error) {
    console.error(`Falha ao vincular ${p.nomeAtual}: ${error.message}`)
    process.exit(1)
  }
}
if (atualizar.length) console.log(`  agendas vinculadas: ${atualizar.length}`)

const { count } = await db
  .from('professores')
  .select('id', { count: 'exact', head: true })
  .not('google_calendar_id', 'is', null)

console.log(`\nProfessores com agenda vinculada: ${count}`)
console.log('Falta ligar GOOGLE_CALENDAR_ATIVO=true (docs/google-agenda.md, passo 6).')
