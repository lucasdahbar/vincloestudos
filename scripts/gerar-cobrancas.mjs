/**
 * Gera as cobrancas de um mes, direto no banco.
 *
 * Existe separado da aplicacao pelo mesmo motivo de `sincronizar.mjs`: a geracao
 * mensal roda fora do request. Reproduz a logica de `src/dados/cobrancas.ts`
 * usando a MESMA funcao de dominio (`montarCobrancas`), entao as duas nao podem
 * divergir na regra de negocio.
 *
 * Uso:
 *   npx tsx scripts/gerar-cobrancas.mjs 2026-08
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { montarCobrancas } from '../src/dominio/cobrancas/geracao.ts'
import { deNumeric, paraNumeric, somar } from '../src/dominio/dinheiro.ts'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const mes = process.argv[2]
if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
  console.error('Uso: npx tsx scripts/gerar-cobrancas.mjs <AAAA-MM>')
  process.exit(1)
}

const [ano, m] = mes.split('-').map(Number)
const primeiro = `${mes}-01`
const ultimo = `${mes}-${String(new Date(ano, m, 0).getDate()).padStart(2, '0')}`

const { data: aulas } = await db
  .from('aulas')
  .select(`
    id, data_hora_inicio, status, turma_id,
    turma:turmas!turma_id (
      id, servico_id,
      servico:servicos!servico_id (nome),
      materia:materias!materia_id (nome),
      ano_escolar:anos_escolares!ano_escolar_id (nome)
    )
  `)
  .gte('data_hora_inicio', `${primeiro}T00:00:00`)
  .lte('data_hora_inicio', `${ultimo}T23:59:59`)

const { data: matriculas } = await db
  .from('matriculas')
  .select(
    'aluno_id, turma_id, status, flag_reposicao, data_inicio, data_fim, aluno:alunos!aluno_id (id, nome, responsavel:responsaveis!responsavel_id (id, nome))',
  )

const { data: cobradas } = await db.from('itens_cobranca').select('aula_id')
const jaCobradas = new Set((cobradas ?? []).map((c) => c.aula_id))

// Valor vigente do servico NA DATA DA AULA, resolvido uma vez por par.
const valores = new Map()
for (const a of aulas ?? []) {
  const dia = a.data_hora_inicio.slice(0, 10)
  const chave = `${a.turma?.servico_id}|${dia}`
  if (valores.has(chave)) continue
  const { data } = await db.rpc('valor_servico_em', {
    p_servico_id: a.turma.servico_id,
    p_data: dia,
  })
  valores.set(chave, deNumeric(data ?? '0'))
}

const faturaveis = []
for (const a of aulas ?? []) {
  const dia = a.data_hora_inicio.slice(0, 10)
  const daTurma = (matriculas ?? []).filter(
    (mt) =>
      mt.turma_id === a.turma_id && mt.data_inicio <= dia && (!mt.data_fim || mt.data_fim >= dia),
  )

  for (const mt of daTurma) {
    if (!mt.aluno?.responsavel) continue
    faturaveis.push({
      aula_id: a.id,
      aluno_id: mt.aluno_id,
      aluno_nome: mt.aluno.nome,
      responsavel_id: mt.aluno.responsavel.id,
      responsavel_nome: mt.aluno.responsavel.nome,
      data: dia,
      descricao: [a.turma?.materia?.nome, a.turma?.ano_escolar?.nome, a.turma?.servico?.nome]
        .filter(Boolean)
        .join(' — '),
      valor: valores.get(`${a.turma?.servico_id}|${dia}`) ?? 0,
      status_aula: a.status,
      matricula_ativa: mt.status === 'Ativa',
      matricula_reposicao: mt.flag_reposicao,
      ja_cobrada: jaCobradas.has(a.id),
    })
  }
}

const montadas = montarCobrancas(faturaveis)
let criadas = 0
let itensNovos = 0

for (const c of montadas) {
  const { data: existente } = await db
    .from('cobrancas')
    .select('id, status')
    .eq('responsavel_id', c.responsavel_id)
    .eq('mes_referencia', primeiro)
    .maybeSingle()

  if (existente && existente.status !== 'Rascunho') continue

  let cobrancaId = existente?.id
  if (!cobrancaId) {
    const { data, error } = await db
      .from('cobrancas')
      .insert({ responsavel_id: c.responsavel_id, mes_referencia: primeiro })
      .select('id')
      .single()
    if (error) {
      console.error(`Falha ao criar cobranca: ${error.message}`)
      process.exit(1)
    }
    cobrancaId = data.id
    criadas++
  }

  const { error } = await db.from('itens_cobranca').insert(
    c.itens.map((i) => ({
      cobranca_id: cobrancaId,
      aluno_id: i.aluno_id,
      aula_id: i.aula_id,
      descricao: i.descricao,
      valor_original: paraNumeric(i.valor_original),
      desconto: paraNumeric(i.desconto),
      valor_final: paraNumeric(i.valor_final),
    })),
  )
  if (error) {
    console.error(`Falha ao gravar itens: ${error.message}`)
    process.exit(1)
  }
  itensNovos += c.itens.length

  // Totais derivados dos itens, sempre.
  const { data: todos } = await db
    .from('itens_cobranca')
    .select('valor_original, desconto')
    .eq('cobranca_id', cobrancaId)

  const bruto = somar(...todos.map((i) => deNumeric(i.valor_original)))
  const desconto = somar(...todos.map((i) => deNumeric(i.desconto)))
  await db
    .from('cobrancas')
    .update({
      valor_bruto: paraNumeric(bruto),
      valor_desconto: paraNumeric(desconto),
      valor_total: paraNumeric(bruto - desconto),
    })
    .eq('id', cobrancaId)

  console.log(`  ${c.responsavel_nome}: ${c.itens.length} aula(s) novas`)
}

const [{ count: qtdCobrancas }, { count: qtdItens }] = await Promise.all([
  db.from('cobrancas').select('*', { count: 'exact', head: true }),
  db.from('itens_cobranca').select('*', { count: 'exact', head: true }),
])

console.log(
  `\nCriadas agora: ${criadas} cobranca(s), ${itensNovos} item(ns).` +
    ` Total no banco: ${qtdCobrancas} cobranca(s), ${qtdItens} item(ns).`,
)
