/**
 * Sincroniza a agenda pelo provedor local, direto no banco.
 *
 * Existe separado da aplicacao porque a sincronizacao periodica (Operacionais
 * 4.3) vai rodar fora do request: por cron ou job. Por ora e manual.
 *
 * Uso:
 *   node scripts/sincronizar.mjs 2026-08-01 2026-08-31
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { materializar } from '../src/dominio/agenda/materializacao.ts'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const [de, ate] = process.argv.slice(2)
if (!de || !ate) {
  console.error('Uso: node scripts/sincronizar.mjs <AAAA-MM-DD> <AAAA-MM-DD>')
  process.exit(1)
}

const { data: turmas } = await db
  .from('turmas')
  .select('id, nome, dias_semana, horario_inicio, horario_fim, status')
  .eq('status', 'Ativa')

let total = 0
for (const t of turmas ?? []) {
  const oc = materializar(
    {
      id: t.id,
      dias_semana: t.dias_semana ?? [],
      horario_inicio: String(t.horario_inicio).slice(0, 5),
      horario_fim: String(t.horario_fim).slice(0, 5),
      status: t.status,
    },
    de,
    ate,
  )
  if (oc.length === 0) continue

  const { data, error } = await db
    .from('aulas')
    .upsert(
      oc.map((o) => ({
        turma_id: t.id,
        google_calendar_event_id: o.google_calendar_event_id,
        data_hora_inicio: `${o.data}T${o.horario_inicio}:00`,
        data_hora_fim: `${o.data}T${o.horario_fim}:00`,
      })),
      { onConflict: 'google_calendar_event_id', ignoreDuplicates: true },
    )
    .select('id')

  if (error) {
    console.error(`Falha na turma ${t.id}: ${error.message}`)
    process.exit(1)
  }
  console.log(`  ${t.nome.slice(0, 50)}: ${oc.length} ocorrencias, ${data.length} novas`)
  total += data.length
}

const { count } = await db.from('aulas').select('*', { count: 'exact', head: true })
console.log(`\nCriadas agora: ${total}. Total de aulas no banco: ${count}.`)
