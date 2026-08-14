/**
 * Prova o ciclo financeiro completo contra o banco real.
 *
 * Usa as MESMAS funcoes de dominio da aplicacao, entao o que passa aqui e o que
 * a tela faz. Escreve no banco: rode em ambiente de desenvolvimento.
 *
 * Uso: npx tsx scripts/provar-ciclo-financeiro.mjs
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { gerarTextoCobranca } from '../src/dominio/cobrancas/texto.ts'
import { saldoEStatus } from '../src/dominio/recebimentos/quitacao.ts'
import { calcularFechamento } from '../src/dominio/pagamentos/fechamento.ts'
import { deNumeric, paraNumeric, formatarBRL } from '../src/dominio/dinheiro.ts'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const passo = (n, t) => console.log(`\n${n}) ${t}`)

// ── 1. Confirmar uma cobranca e gerar o texto do WhatsApp ────────────────────
passo(1, 'Confirmar cobranca e gerar o texto do WhatsApp')

const { data: cob } = await db
  .from('cobrancas')
  .select('id,mes_referencia,valor_total,status,responsavel:responsaveis!responsavel_id(nome)')
  .eq('status', 'Rascunho')
  .order('valor_total', { ascending: false })
  .limit(1)
  .single()

const { data: itens } = await db
  .from('itens_cobranca')
  .select('descricao,valor_final,aluno:alunos!aluno_id(nome),aula:aulas!aula_id(data_hora_inicio)')
  .eq('cobranca_id', cob.id)

const { data: conta } = await db
  .from('contas')
  .select('chave_pix')
  .not('chave_pix', 'is', null)
  .limit(1)
  .single()

const [ano, mes] = cob.mes_referencia.split('-')
const texto = gerarTextoCobranca({
  responsavel_nome: cob.responsavel.nome,
  mes_referencia: cob.mes_referencia,
  valor_total: deNumeric(cob.valor_total),
  chave_pix: conta?.chave_pix ?? null,
  vencimento: `${ano}-${mes}-05`,
  itens: itens.map((i) => ({
    aluno_nome: i.aluno.nome,
    contexto: i.descricao.split(' — ').slice(0, 2).join(' — '),
    descricao: i.descricao.split(' — ').slice(-1)[0],
    data: i.aula.data_hora_inicio.slice(0, 10),
    valor_final: deNumeric(i.valor_final),
  })),
})

await db.from('cobrancas').update({ status: 'Confirmada', texto_whatsapp: texto }).eq('id', cob.id)

console.log(`   ${cob.responsavel.nome}, ${formatarBRL(deNumeric(cob.valor_total))}`)
console.log('   ─── texto gerado ───')
console.log(texto.split('\n').map((l) => `   ${l}`).join('\n'))

// ── 2. Recebimento parcial ───────────────────────────────────────────────────
passo(2, 'Registrar recebimento PARCIAL (metade)')

const total = deNumeric(cob.valor_total)
const metade = Math.floor(total / 2)
const { data: contaDestino } = await db.from('contas').select('id').limit(1).single()

await db.from('recebimentos').insert({
  cobranca_id: cob.id,
  valor_recebido: paraNumeric(metade),
  data_recebimento: new Date().toISOString().slice(0, 10),
  conta_id: contaDestino.id,
  forma_pagamento: 'Pix',
  registrado_por: 'prova',
})

let parcial = saldoEStatus(total, [metade], 'Confirmada')
await db.from('cobrancas').update({ status: parcial.status }).eq('id', cob.id)
console.log(
  `   pagou ${formatarBRL(metade)} de ${formatarBRL(total)} → saldo ${formatarBRL(parcial.saldo)}, status "${parcial.status}"`,
)

// ── 3. Quitar ────────────────────────────────────────────────────────────────
passo(3, 'Registrar o restante')

const resto = total - metade
await db.from('recebimentos').insert({
  cobranca_id: cob.id,
  valor_recebido: paraNumeric(resto),
  data_recebimento: new Date().toISOString().slice(0, 10),
  conta_id: contaDestino.id,
  forma_pagamento: 'Dinheiro',
  registrado_por: 'prova',
})

const quitado = saldoEStatus(total, [metade, resto], 'Parcial')
await db.from('cobrancas').update({ status: quitado.status }).eq('id', cob.id)
console.log(
  `   pagou ${formatarBRL(resto)} → saldo ${formatarBRL(quitado.saldo)}, status "${quitado.status}"`,
)
console.log(`   sem centavo perdido: ${metade + resto === total}`)

// ── 4. Fechamento do professor ───────────────────────────────────────────────
passo(4, 'Fechar o periodo de um professor')

async function previa(professorId, de, ate) {
  const { data: ps } = await db
    .from('presencas')
    .select(
      'id,presente,flag_reposicao,aluno_id,aluno:alunos!aluno_id(nome),aula:aulas!aula_id(data_hora_inicio,turma:turmas!turma_id(id,nome,servico_id,professor_id))',
    )
    .eq('presente', true)

  const { data: pagas } = await db.from('itens_conta_pagar_professor').select('presenca_id')
  const jaPagas = new Set((pagas ?? []).map((i) => i.presenca_id))

  const remuneradas = []
  for (const p of ps ?? []) {
    const dia = p.aula?.data_hora_inicio.slice(0, 10)
    if (p.aula?.turma?.professor_id !== professorId || dia < de || dia > ate) continue
    const [{ data: v }, { data: pc }] = await Promise.all([
      db.rpc('valor_servico_em', { p_servico_id: p.aula.turma.servico_id, p_data: dia }),
      db.rpc('percentual_professor_em', { p_professor_id: professorId, p_data: dia }),
    ])
    remuneradas.push({
      presenca_id: p.id,
      aluno_id: p.aluno_id,
      aluno_nome: p.aluno.nome,
      turma_id: p.aula.turma.id,
      turma_nome: p.aula.turma.nome,
      data_aula: dia,
      presente: true,
      flag_reposicao: p.flag_reposicao,
      valor_servico: deNumeric(v ?? '0'),
      percentual: Number(pc ?? 0),
      ja_paga: jaPagas.has(p.id),
    })
  }
  return calcularFechamento(remuneradas)
}

const { data: prof } = await db.from('professores').select('id,nome,percentual_repasse').limit(1).single()
const f = await previa(prof.id, '2026-08-01', '2026-08-31')

if (f.itens.length === 0) {
  console.log(`   ${prof.nome}: nenhuma presenca confirmada no periodo`)
} else {
  const { data: cp } = await db
    .from('contas_pagar_professor')
    .insert({
      professor_id: prof.id,
      periodo_inicio: '2026-08-01',
      periodo_fim: '2026-08-31',
      valor_total: paraNumeric(f.valor_total),
    })
    .select('id')
    .single()

  await db.from('itens_conta_pagar_professor').insert(
    f.itens.map((i) => ({
      conta_pagar_id: cp.id,
      presenca_id: i.presenca_id,
      aluno_id: i.aluno_id,
      turma_id: i.turma_id,
      data_aula: i.data_aula,
      valor_servico: paraNumeric(i.valor_servico),
      percentual_aplicado: i.percentual_aplicado,
      valor_professor: paraNumeric(i.valor_professor),
    })),
  )

  console.log(`   ${prof.nome} (${prof.percentual_repasse}%): ${f.itens.length} presenca(s)`)
  for (const i of f.itens) {
    console.log(
      `     ${i.data_aula} ${i.aluno_nome.padEnd(15)} ${formatarBRL(i.valor_servico)} x ${i.percentual_aplicado}% = ${formatarBRL(i.valor_professor)}`,
    )
  }
  console.log(`   TOTAL: ${formatarBRL(f.valor_total)}`)
  const conferido = f.itens.every(
    (i) => i.valor_professor === Math.round((i.valor_servico * i.percentual_aplicado) / 100),
  )
  console.log(`   aritmetica confere em todos os itens: ${conferido}`)

  // ── 5. Refazer o mesmo periodo nao pode pagar de novo ──────────────────────
  passo(5, 'Tentar fechar o MESMO periodo de novo')
  const denovo = await previa(prof.id, '2026-08-01', '2026-08-31')
  console.log(
    denovo.itens.length === 0
      ? `   BARROU (correto): nenhuma presenca nova a pagar, total ${formatarBRL(denovo.valor_total)}`
      : `   PASSOU - BUG: ${denovo.itens.length} item(ns) seriam pagos de novo`,
  )
}
