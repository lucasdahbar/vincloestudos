/**
 * Prova o ciclo da chamada de ponta a ponta, como acontece na vida real:
 * a gestora gera o link na tela da aula, o professor abre no celular dele
 * (sem sessao nenhuma) e confirma as presencas.
 *
 * Uso: node scripts/verificar-chamada.mjs   |   BASE=https://... node ...
 */
import { readFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]))
const BASE=process.env.BASE??'http://localhost:3000'
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const ck=(r,ok,x='')=>{console.log(`  ${ok?'ok   ':'FALHA'} ${r}${x?` — ${x}`:''}`);return ok}
let falhas=0

// aula Agendada com aluno matriculado
const {data:aulas}=await db.from('aulas').select('id,turma_id,data_hora_inicio').eq('status','Agendada').order('data_hora_inicio')
let alvo=null
for(const a of aulas){
  const dia=a.data_hora_inicio.slice(0,10)
  const {data:m}=await db.from('matriculas').select('aluno_id,data_fim,aluno:alunos!aluno_id(nome)').eq('turma_id',a.turma_id).eq('status','Ativa').lte('data_inicio',dia)
  const v=(m||[]).filter(x=>!x.data_fim||x.data_fim>=dia)
  if(v.length){alvo={...a,alunos:v};break}}
if(!alvo){console.log('sem aula disponivel');process.exit(1)}
await db.from('presenca_tokens').delete().eq('aula_id',alvo.id)
await db.from('presencas').delete().eq('aula_id',alvo.id)

const nav=await chromium.launch()
const ctxG=await nav.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}})
const g=await ctxG.newPage()
await g.goto(`${BASE}/login`,{waitUntil:'networkidle'})
await g.fill('input[name="email"]','gestora@mesinharedonda.app')
await g.fill('input[name="senha"]',env.SENHA_TESTE)
await g.click('button[type="submit"]')
await g.waitForURL(u=>!u.pathname.includes('login'),{timeout:20000})

console.log(`Aula ${alvo.id} (${alvo.data_hora_inicio.slice(0,10)}), ${alvo.alunos.length} aluno(s)\n`)
await g.goto(`${BASE}/agenda/aulas/${alvo.id}`,{waitUntil:'networkidle'})

if(!ck('gestora ve o cartao do link', await g.getByText('Link da chamada').isVisible()))falhas++
await g.getByRole('button',{name:/Gerar link/}).click()
await g.waitForSelector('text=/\/p\/presenca\//',{timeout:15000})
const url=(await g.locator('.font-mono').first().innerText()).trim()
if(!ck('link gerado na tela', url.includes('/p/presenca/'), url.slice(0,60)+'…'))falhas++

// clicar de novo nao pode trocar o token: invalidaria o link ja enviado
await g.reload({waitUntil:'networkidle'})
const url2=(await g.locator('.font-mono').first().innerText()).trim()
if(!ck('recarregar mantem o MESMO link', url===url2))falhas++

// professor: aba limpa, sem sessao
const ctxP=await nav.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}})
const prof=await ctxP.newPage()
await prof.goto(url,{waitUntil:'networkidle'})
const html=await prof.locator('body').innerText()
if(!ck('professor abre sem login', alvo.alunos.every(a=>html.includes(a.aluno.nome))))falhas++

// marcar o primeiro como faltou e confirmar
await prof.getByRole('button',{name:'Faltou'}).first().click()
await prof.getByRole('button',{name:/Confirmar presen/}).click()
await prof.waitForSelector('text=Tudo certo',{timeout:20000}).catch(()=>{})
if(!ck('confirmacao registrada', (await prof.locator('body').innerText()).includes('Tudo certo')))falhas++

const {data:ps}=await db.from('presencas').select('presente').eq('aula_id',alvo.id)
if(!ck('presencas gravadas', ps.length===alvo.alunos.length, `${ps.length} registro(s), ${ps.filter(p=>!p.presente).length} falta(s)`))falhas++
const {data:pend}=await db.from('pendencias_reposicao').select('id,status').eq('aula_origem_id',alvo.id)
if(!ck('falta gerou pendencia de reposicao', pend.length===1, pend[0]?.status))falhas++
const {data:au}=await db.from('aulas').select('status').eq('id',alvo.id).single()
if(!ck('aula virou Realizada', au.status==='Realizada'))falhas++

// link travado depois de confirmado
await prof.goto(url,{waitUntil:'networkidle'})
if(!ck('link trava apos confirmar', (await prof.locator('body').innerText()).includes('já foi confirmada')))falhas++

// gestora ve o estado e pode reabrir
await g.goto(`${BASE}/agenda/aulas/${alvo.id}`,{waitUntil:'networkidle'})
if(!ck('gestora ve "Chamada confirmada"', await g.getByText('Chamada confirmada').isVisible()))falhas++
await g.getByRole('button',{name:/Reabrir/}).click()
await g.waitForTimeout(3000)
await prof.goto(url,{waitUntil:'networkidle'})
if(!ck('reabrir libera o link de novo', !(await prof.locator('body').innerText()).includes('já foi confirmada')))falhas++

console.log(falhas===0?'\n  Ciclo completo da chamada funciona.':`\n  ${falhas} falha(s).`)
await nav.close()
process.exit(falhas?1:0)
