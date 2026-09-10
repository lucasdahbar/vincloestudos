/**
 * Apaga a massa de teste, preservando os professores e as agendas do Google.
 *
 * `semear.mjs --limpar` nao serve aqui: ele apaga `professores` junto, e com
 * isso as 14 agendas vinculadas em G1 — trabalho que a escola nao consegue
 * refazer sozinha, porque os IDs vem da conta do Workspace.
 *
 * Tambem preserva as tabelas de apoio (escolas, materias, servicos, cidades,
 * anos_escolares, contas, feriados): sao catalogo, nao dados de teste.
 *
 * Uso:
 *   node scripts/limpar-dados-de-teste.mjs --ensaio   # so conta o que apagaria
 *   node scripts/limpar-dados-de-teste.mjs --confirmo # apaga
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

/**
 * Filhos antes dos pais; o banco recusaria a ordem inversa.
 *
 * A ordem de `semear.mjs` nao serve: ela e anterior a Rodada 2 e nao conhece
 * o financeiro do professor (`itens_conta_pagar_professor` aponta para
 * `presencas`), nem os tokens de presenca, recessos e pendencias.
 */
const ORDEM = [
  'baixas_conta_pagar',
  'itens_conta_pagar_professor',
  'contas_pagar_professor',
  'recebimentos',
  'itens_cobranca',
  'cobrancas',
  'pendencias_reposicao',
  'presenca_tokens',
  'presencas',
  'aulas',
  'notificacoes',
  'logs_operacionais',
  'matriculas',
  'recessos_escola',
  'turmas',
  'alunos',
  'responsaveis',
]

const ENSAIO = process.argv.includes('--ensaio')

if (!ENSAIO && !process.argv.includes('--confirmo')) {
  console.error('Isto apaga dados e nao tem volta. Rode com --ensaio para ver, ou --confirmo.')
  process.exit(1)
}

/** Nem toda tabela tem `id`: `presenca_tokens` e chaveada pelo proprio token. */
const CHAVE = { presenca_tokens: 'token' }

async function contar(tabela) {
  const { count, error } = await db
    .from(tabela)
    .select(CHAVE[tabela] ?? 'id', { count: 'exact', head: true })
  return error ? null : count
}

console.log(ENSAIO ? 'Ensaio — nada sera apagado.\n' : 'Apagando...\n')

for (const tabela of ORDEM) {
  const antes = await contar(tabela)
  if (antes === null) {
    console.log(`  ${tabela}: tabela ausente, ignorada`)
    continue
  }

  if (ENSAIO) {
    console.log(`  ${tabela}: ${antes} apagaria`)
    continue
  }

  // O PostgREST exige um filtro em delete; este pega tudo.
  const chave = CHAVE[tabela] ?? 'id'
  const { error } = await db
    .from(tabela)
    .delete()
    .not(chave, 'is', null)
  if (error) {
    console.error(`  ${tabela}: FALHOU — ${error.message}`)
    process.exit(1)
  }
  console.log(`  ${tabela}: ${antes} apagados`)
}

const professores = await contar('professores')
const { count: comAgenda } = await db
  .from('professores')
  .select('id', { count: 'exact', head: true })
  .not('google_calendar_id', 'is', null)

console.log(`\nPreservados: ${professores} professores, ${comAgenda} com agenda vinculada.`)
