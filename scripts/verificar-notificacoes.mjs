/**
 * Prova as notificacoes de ponta a ponta, num navegador.
 *
 * Matricular um aluno numa turma online deve enfileirar boas-vindas; preparar
 * lembretes deve montar a mensagem com o link de cada aula online.
 */
import { readFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]))
const BASE=process.env.BASE??'http://localhost:3000'
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
let falhas=0
const ck=(r,ok,x='')=>{console.log(`  ${ok?'ok   ':'FALHA'} ${r}${x?` — ${x}`:''}`);if(!ok)falhas++;return ok}

// turma Online e um aluno ainda nao matriculado nela
const {data:turmas}=await db.from('turmas').select('id,nome,modalidade').eq('modalidade','Online').eq('status','Ativa')
const turma=turmas[0]
const {data:alunos}=await db.from('alunos').select('id,nome,destinatario_notificacao,canal_notificacao').eq('ativo',true).order('id')
// Usa sempre o ultimo aluno e desfaz a matricula anterior: o script precisa
// poder rodar quantas vezes for preciso.
const aluno=alunos[alunos.length-1]
if(!aluno){console.log('sem aluno cadastrado');process.exit(1)}
await db.from('matriculas').delete().eq('turma_id',turma.id).eq('aluno_id',aluno.id)
// Garante contato no canal preferido: sem isso o sistema (corretamente) nao
// enfileira, e o teste mediria a coisa errada.
const patch={}
if(['Aluno','Ambos'].includes(aluno.destinatario_notificacao)){
  if(['WhatsApp','Ambos'].includes(aluno.canal_notificacao)) patch.telefone='(19) 99900-0000'
  if(['E-mail','Ambos'].includes(aluno.canal_notificacao)) patch.email='aluno.teste@exemplo.com'}
if(Object.keys(patch).length) await db.from('alunos').update(patch).eq('id',aluno.id)
console.log(`Turma online: ${turma.nome.slice(0,40)}\nAluno: ${aluno.nome} (avisar: ${aluno.destinatario_notificacao} por ${aluno.canal_notificacao})\n`)

// garante link na aula, para o lembrete existir
await db.from('aulas').update({link_online:'https://meet.exemplo.com/sala-teste'}).eq('turma_id',turma.id).eq('status','Agendada')
await db.from('notificacoes').delete().gte('id',0)

const nav=await chromium.launch()
const ctx=await nav.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}})
const p=await ctx.newPage()
await p.goto(`${BASE}/login`,{waitUntil:"domcontentloaded"})
await p.fill('input[name="email"]','gestora@mesinharedonda.app')
await p.fill('input[name="senha"]',env.SENHA_TESTE)
await p.click('button[type="submit"]')
await p.waitForURL(u=>!u.pathname.includes('login'),{timeout:20000})

// 1. matricular pela tela
await p.goto(`${BASE}/matriculas/nova`,{waitUntil:"domcontentloaded"})
await p.locator('select').first().selectOption(String(aluno.id))
await p.locator('select').nth(1).selectOption(String(turma.id))
await p.getByRole('button',{name:'Matricular'}).click()
await p.waitForURL('**/matriculas',{timeout:20000}).catch(()=>{})
await p.waitForTimeout(2500)

const {data:bv}=await db.from('notificacoes').select('tipo,canal,destinatario_tipo,texto_gerado,status').eq('tipo','BoasVindas')
ck('matricular enfileirou boas-vindas', bv.length>0, `${bv.length} mensagem(ns)`)
if(bv.length){
  ck('texto traz a turma', bv[0].texto_gerado.includes(turma.nome.split(' ·')[0]))
  ck('texto traz dias e horario', /Dias:/.test(bv[0].texto_gerado)&&/Horário:/.test(bv[0].texto_gerado))
  ck('texto traz o link da sala', bv[0].texto_gerado.includes('Link da sala'))
  ck('status Pronta', bv[0].status==='Pronta')
}

// 2. lembretes das aulas
await p.goto(`${BASE}/mensagens`,{waitUntil:"domcontentloaded"})
await p.waitForSelector('h1',{timeout:20000})
ck('gestora ve a tela de mensagens', await p.getByText('Mensagens a enviar').isVisible())
await p.waitForFunction(()=>{const b=[...document.querySelectorAll("button")].find(x=>/Preparar lembretes/.test(x.textContent||""));return b&&!b.disabled},{timeout:20000})
await p.waitForTimeout(1200)
await p.getByRole('button',{name:/Preparar lembretes/}).click()
await p.waitForTimeout(4000)
const {data:la}=await db.from('notificacoes').select('tipo,texto_gerado,agendado_para').eq('tipo','LinkAula')
ck('lembretes de aula enfileirados', la.length>0, `${la.length} mensagem(ns)`)
if(la.length){
  ck('lembrete traz o link da aula', la[0].texto_gerado.includes('meet.exemplo.com'))
  ck('agendado com antecedencia', Boolean(la[0].agendado_para))
}

// 3. nao duplica
await p.waitForFunction(()=>{const b=[...document.querySelectorAll("button")].find(x=>/Preparar lembretes/.test(x.textContent||""));return b&&!b.disabled},{timeout:20000})
await p.waitForTimeout(1200)
await p.getByRole('button',{name:/Preparar lembretes/}).click()
await p.waitForTimeout(4000)
const {count}=await db.from('notificacoes').select('*',{count:'exact',head:true}).eq('tipo','LinkAula')
ck('preparar de novo NAO duplica', count===la.length, `${count} (antes ${la.length})`)

// 4. marcar como enviada tira da fila
await p.reload({waitUntil:"domcontentloaded"})
const antes=await p.locator('pre').count()
await p.getByRole('button',{name:'Já enviei'}).first().click()
await p.waitForTimeout(3000)
await p.reload({waitUntil:"domcontentloaded"})
ck('"Já enviei" tira da fila', await p.locator('pre').count()===antes-1)

console.log(falhas===0?'\n  Notificacoes funcionam.':`\n  ${falhas} falha(s).`)
await nav.close()
process.exit(falhas?1:0)
