/**
 * Consulta o banco remoto para verificacao manual durante o desenvolvimento.
 *
 * O CLI do Supabase nao expoe `db psql` contra projeto remoto, entao usamos a
 * service_role key (que ignora RLS) via PostgREST. E ferramenta de conferencia,
 * nao faz parte do runtime da aplicacao.
 *
 * Uso:
 *   node scripts/consultar.mjs <tabela> [colunas] [--count]
 *
 * Exemplos:
 *   node scripts/consultar.mjs turmas
 *   node scripts/consultar.mjs servico_valor_historico "valor,vigencia_inicio,vigencia_fim"
 *   node scripts/consultar.mjs alunos --count
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
const url = env.NEXT_PUBLIC_SUPABASE_URL
const chave = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !chave) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local')
  process.exit(1)
}

const [tabela, colunas = '*'] = process.argv.slice(2)
const contar = process.argv.includes('--count')

if (!tabela) {
  console.error('Informe a tabela. Ex.: node scripts/consultar.mjs turmas')
  process.exit(1)
}

const supabase = createClient(url, chave, { auth: { persistSession: false } })

const { data, error, count } = await supabase
  .from(tabela)
  .select(contar ? '*' : colunas, contar ? { count: 'exact', head: true } : {})

if (error) {
  console.error(`ERRO em ${tabela}: ${error.message}`)
  process.exit(1)
}

if (contar) {
  console.log(`${tabela}: ${count} registro(s)`)
} else {
  console.log(JSON.stringify(data, null, 2))
}
