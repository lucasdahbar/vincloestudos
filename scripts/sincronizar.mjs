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
import { datasPuladas } from '../src/dominio/agenda/datas-puladas.ts'

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

const { data: turmas, error: erroTurmas } = await db
  .from('turmas')
  .select(
    'id, nome, tipo_recorrencia, data_unica, frequencia, intervalo, dias_semana, data_inicio, data_fim, horario_inicio, horario_fim, status, escola_id',
  )
  .eq('status', 'Ativa')
if (erroTurmas) {
  console.error(`Falha ao ler as turmas: ${erroTurmas.message}`)
  process.exit(1)
}

// Feriados e recessos lidos uma vez so (como em src/dados/calendario.ts): um
// recesso que comecou antes da janela continua valendo dentro dela.
const [resFeriados, resRecessos] = await Promise.all([
  db.from('feriados').select('data, nome').gte('data', de).lte('data', ate),
  db
    .from('recessos_escola')
    .select('escola_id, descricao, data_inicio, data_fim')
    .lte('data_inicio', ate)
    .gte('data_fim', de),
])
const erroCalendario = resFeriados.error ?? resRecessos.error
if (erroCalendario) {
  console.error(`Falha ao ler feriados e recessos: ${erroCalendario.message}`)
  process.exit(1)
}
const feriados = (resFeriados.data ?? []).map((f) => ({ data: String(f.data).slice(0, 10), nome: f.nome }))
const recessos = (resRecessos.data ?? []).map((r) => ({
  escola_id: r.escola_id,
  descricao: r.descricao,
  data_inicio: String(r.data_inicio).slice(0, 10),
  data_fim: String(r.data_fim).slice(0, 10),
}))

let total = 0
for (const t of turmas ?? []) {
  const puladas = new Set(datasPuladas(t.escola_id, feriados, recessos, de, ate).keys())
  const oc = materializar(
    {
      id: t.id,
      // Sem estes dois, turma de aula unica (T1) sai com zero ocorrencias em
      // silencio: ela nao tem dias_semana, so data_unica.
      tipo_recorrencia: t.tipo_recorrencia,
      data_unica: t.data_unica,
      frequencia: t.frequencia,
      intervalo: t.intervalo,
      dias_semana: t.dias_semana ?? [],
      data_inicio: t.data_inicio ? String(t.data_inicio).slice(0, 10) : null,
      data_fim: t.data_fim ? String(t.data_fim).slice(0, 10) : null,
      horario_inicio: String(t.horario_inicio).slice(0, 5),
      horario_fim: String(t.horario_fim).slice(0, 5),
      status: t.status,
    },
    de,
    ate,
    puladas,
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
