/**
 * Cria um usuario de login e o perfil correspondente.
 *
 * Inserir direto em `auth.users` por SQL funciona no Supabase local, mas em
 * projeto remoto e fragil: o schema de auth e gerenciado pelo GoTrue e pode
 * mudar entre versoes. A API de admin e o caminho suportado.
 *
 * Uso:
 *   node scripts/criar-usuario.mjs <email> <senha> <nome> <gestora|professor> [professor_id]
 *
 * Exemplo:
 *   node scripts/criar-usuario.mjs gestora@mesinharedonda.app "senha-forte" "Gestora" gestora
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
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const [email, senha, nome, papel, professorId] = process.argv.slice(2)

if (!email || !senha || !nome || !papel) {
  console.error(
    'Uso: node scripts/criar-usuario.mjs <email> <senha> <nome> <gestora|professor> [professor_id]',
  )
  process.exit(1)
}

if (papel !== 'gestora' && papel !== 'professor') {
  console.error(`Papel invalido: ${papel}. Use "gestora" ou "professor".`)
  process.exit(1)
}

// Se o usuario ja existe, reaproveita em vez de falhar — o script precisa ser
// seguro de rodar duas vezes.
const { data: existentes } = await supabase.auth.admin.listUsers()
let usuario = existentes?.users?.find((u) => u.email === email)

if (usuario) {
  console.log(`Usuario ${email} ja existia (${usuario.id}).`)
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (error) {
    console.error(`Falha ao criar usuario: ${error.message}`)
    process.exit(1)
  }
  usuario = data.user
  console.log(`Usuario ${email} criado (${usuario.id}).`)
}

const { error: erroPerfil } = await supabase.from('perfis').upsert(
  {
    usuario_id: usuario.id,
    nome,
    papel,
    professor_id: professorId ? Number(professorId) : null,
  },
  { onConflict: 'usuario_id' },
)

if (erroPerfil) {
  console.error(`Falha ao gravar o perfil: ${erroPerfil.message}`)
  process.exit(1)
}

console.log(`Perfil gravado: ${nome} (${papel}).`)
