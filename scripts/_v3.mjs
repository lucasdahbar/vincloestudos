import { chromium, devices } from 'playwright'
const BASE=process.env.BASE??'http://localhost:3000'
const nav=await chromium.launch()
const ctx=await nav.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}})
const p=await ctx.newPage()
await p.goto(`${BASE}/login`,{waitUntil:'networkidle'})
await p.fill('input[name="email"]','gestora@mesinharedonda.app')
await p.fill('input[name="senha"]','mesinha123')
await p.click('button[type="submit"]')
await p.waitForURL(u=>!u.pathname.includes('login'),{timeout:20000})
for(const rota of ['/','/agenda','/cadastros/alunos','/cobrancas']){
  await p.goto(BASE+rota,{waitUntil:'networkidle'})
  const r=await p.evaluate(()=>{
    const n=[...document.querySelectorAll('nav[aria-label="Navegação principal"]')].pop()
    const b=n.getBoundingClientRect()
    const h=document.querySelector('header')
    return {navY:Math.round(b.y),navFim:Math.round(b.bottom),cabY:h?Math.round(h.getBoundingClientRect().y):null,scroll:window.scrollY}})
  const preso = r.navFim>=840 && r.navFim<=848
  console.log(`  ${preso?'ok   ':'FALHA'} ${rota.padEnd(20)} barra: y=${r.navY} fim=${r.navFim} (tela 844) | cabecalho y=${r.cabY}`)
}
await nav.close()
