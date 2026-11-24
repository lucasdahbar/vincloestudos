/**
 * Apaga as cobrancas de antes de 01/11/2026. Outubro foi cobrado fora do
 * sistema (Julio, 03/11/2026), mas 101 rascunhos ficaram e apareciam para
 * abater credito (24/11/2026).
 *
 * Recusa tudo se alguma delas tiver recebimento ou credito ligado a um item:
 * essas nao sao "de mentira" e precisam de olhar humano. Itens saem em cascata.
 *
 *   node scripts/apagar-cobrancas-de-outubro.mjs --ensaio     so conta
 *   node scripts/apagar-cobrancas-de-outubro.mjs --confirmo   apaga
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const confirmo = process.argv.includes('--confirmo')
if (!confirmo && !process.argv.includes('--ensaio')) {
  console.error('Use --ensaio ou --confirmo.')
  process.exit(1)
}

const { data: cobs, error } = await s
  .from('cobrancas')
  .select('id, status, valor_total')
  .lt('mes_referencia', '2026-11-01')
if (error) throw error
const ids = cobs.map((c) => c.id)
const porStatus = {}
for (const c of cobs) porStatus[c.status] = (porStatus[c.status] ?? 0) + 1
console.log(`Cobrancas antes de 11/2026: ${cobs.length}`, porStatus)
if (ids.length === 0) process.exit(0)

const { data: itens } = await s.from('itens_cobranca').select('id').in('cobranca_id', ids)
const { data: rec } = await s.from('recebimentos').select('id').in('cobranca_id', ids)
const { data: cred } = await s
  .from('creditos')
  .select('id')
  .in('item_cobranca_id', itens.length ? itens.map((i) => i.id) : [0])
console.log(`Itens: ${itens.length} | recebimentos: ${rec.length} | creditos ligados: ${cred.length}`)

if (rec.length > 0 || cred.length > 0) {
  console.error('Ha recebimento ou credito ligado. Nada foi apagado.')
  process.exit(1)
}
if (!confirmo) {
  console.log('Ensaio: nada foi apagado.')
  process.exit(0)
}

const { error: erroApagar } = await s.from('cobrancas').delete().in('id', ids)
if (erroApagar) throw erroApagar
await s.from('logs_operacionais').insert({
  acao: 'apagar_cobrancas_de_outubro',
  entidade: 'cobrancas',
  entidade_id: null,
  usuario: 'script',
  detalhe: { cobrancas: ids.length, itens: itens.length },
})
const { count } = await s.from('cobrancas').select('id', { count: 'exact', head: true }).lt('mes_referencia', '2026-11-01')
console.log(`Apagadas. Restam antes de 11/2026: ${count}`)
