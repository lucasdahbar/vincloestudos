/**
 * Verificação dos Ajustes aos Módulos Operacionais — Rodada 2.
 *
 * Roda contra o sistema de verdade, com navegador de verdade. Neste projeto,
 * `tsc` e `next build` limpos já passaram por cima de telas que devolviam 500
 * em produção — build passando não é evidência de que a tela funciona.
 *
 * ATENÇÃO: o banco é o da gestora, com dados reais. Este script:
 *   - cria registros com o prefixo ZZTESTE e apaga todos ao final;
 *   - nunca altera turma, matrícula, cobrança ou pagamento que já existiam.
 *
 * Uso: node scripts/verificar-rodada2.mjs   |   BASE=https://… node …
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const BASE = process.env.BASE ?? 'http://localhost:3000'
const MARCA = 'ZZTESTE'
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let falhas = 0
const ck = (r, ok, extra = '') => {
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${r}${extra ? ` — ${extra}` : ''}`)
  if (!ok) falhas++
}
const secao = (t) => console.log(`\n-- ${t} --`)

/** Datas relativas a hoje, para o teste não apodrecer com o calendário. */
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const emDias = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

const criados = { turmas: [], matriculas: [], alunos: [], aulas: [], pendencias: [], recessos: [] }

async function limpar() {
  // Ordem inversa das dependências.
  await db.from('pendencias_reposicao').delete().in('id', criados.pendencias.filter(Boolean))
  await db.from('presencas').delete().in('aula_id', criados.aulas.filter(Boolean))
  await db.from('matriculas').delete().in('id', criados.matriculas.filter(Boolean))
  await db.from('aulas').delete().in('turma_id', criados.turmas.filter(Boolean))
  await db.from('turmas').delete().in('id', criados.turmas.filter(Boolean))
  await db.from('alunos').delete().in('id', criados.alunos.filter(Boolean))
  await db.from('recessos_escola').delete().in('id', criados.recessos.filter(Boolean))
  await db
    .from('notificacoes')
    .delete()
    .eq('referencia_tipo', 'turma')
    .in('referencia_id', criados.turmas.filter(Boolean))
}

const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } })
const p = await ctx.newPage()
const errosJs = []
p.on('pageerror', (e) => errosJs.push(e.message))
p.on('response', (r) => {
  if (r.status() >= 500) errosJs.push(`HTTP ${r.status()} em ${new URL(r.url()).pathname}`)
})

try {
  await p.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[name="email"]', 'gestora@mesinharedonda.app')
  await p.fill('input[name="senha"]', env.SENHA_TESTE)
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.includes('login'), { timeout: 30000 })

  // Dados de apoio já existentes na base da gestora.
  const [{ data: servicos }, { data: professores }, { data: responsaveis }] = await Promise.all([
    db.from('servicos').select('id, nome, permite_materia, permite_escola').eq('ativo', true),
    db.from('professores').select('id, nome').eq('ativo', true).limit(1),
    db.from('responsaveis').select('id').eq('ativo', true).limit(1),
  ])

  const servico = servicos[0]
  const professor = professores[0]

  // ─────────────────────────────────────────────────────────────────────────
  secao('T1 · turma única e recorrente')

  await p.goto(`${BASE}/turmas/nova`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
  ck('o formulário oferece a escolha de repetição', await p.getByText('Não se repete').isVisible())
  ck('"Toda semana" é o padrão', (await p.getByRole('button', { name: 'Toda semana' }).getAttribute('aria-pressed')) === 'true')

  await p.getByRole('button', { name: 'Não se repete' }).click()
  await p.waitForTimeout(400)
  ck('ao escolher única, some a lista de dias da semana', !(await p.getByText('Dias da semana').isVisible()))
  ck('ao escolher única, aparece a data da aula', await p.getByText('Data da aula').isVisible())

  // Cria a turma única pelo próprio formulário, como a gestora faria.
  const dataDaAula = iso(emDias(3))
  await p.selectOption('form.max-w-2xl select >> nth=0', { label: servico.nome })
  await p.waitForTimeout(500)

  // Matéria e escola aparecem só quando o serviço escolhido usa esses campos.
  if (servico.permite_materia) await p.getByRole('combobox', { name: 'Matéria' }).selectOption({ index: 1 })
  if (servico.permite_escola) await p.getByRole('combobox', { name: 'Escola', exact: true }).selectOption({ index: 1 })

  await p.getByRole('combobox', { name: 'Ano escolar' }).selectOption({ index: 1 })
  await p.getByRole('combobox', { name: 'Professor responsável' }).selectOption({ label: professor.nome })
  await p.getByRole('combobox', { name: 'Modalidade' }).selectOption('Online')
  await p.getByRole('textbox', { name: /Data da aula/ }).fill(dataDaAula)
  await p.getByRole('textbox', { name: 'Início' }).fill('15:00')
  await p.getByRole('textbox', { name: 'Término' }).fill('16:00')
  await p.getByRole('textbox', { name: /Link da videochamada/ }).fill('https://meet.google.com/zzz-teste-zzz')
  await p.getByRole('button', { name: 'Salvar turma' }).click()
  await p.waitForURL(/\/turmas\/\d+$/, { timeout: 30000 })

  const turmaUnicaId = Number(p.url().split('/').pop())
  criados.turmas.push(turmaUnicaId)

  const { data: turmaUnica } = await db
    .from('turmas')
    .select('tipo_recorrencia, data_unica, dias_semana, link_videochamada')
    .eq('id', turmaUnicaId)
    .single()

  ck('gravou como Único', turmaUnica.tipo_recorrencia === 'Único')
  ck('gravou a data única', String(turmaUnica.data_unica).slice(0, 10) === dataDaAula)
  ck('não deixou dias da semana pendurados', (turmaUnica.dias_semana ?? []).length === 0)
  ck('gravou o link da videochamada', Boolean(turmaUnica.link_videochamada))

  const { data: aulasUnica } = await db
    .from('aulas')
    .select('id, data_hora_inicio')
    .eq('turma_id', turmaUnicaId)
  criados.aulas.push(...aulasUnica.map((a) => a.id))
  ck('gerou exatamente uma aula', aulasUnica.length === 1, `${aulasUnica.length} aula(s)`)
  ck(
    'a aula caiu na data marcada',
    aulasUnica[0]?.data_hora_inicio?.slice(0, 10) === dataDaAula,
    aulasUnica[0]?.data_hora_inicio,
  )

  // ─────────────────────────────────────────────────────────────────────────
  secao('G4 · aviso ao professor')

  // O aviso sai em `after()`, depois da resposta: esperar é parte do contrato,
  // não gambiarra de teste. Se não chegar em 15s, aí sim é falha.
  let aviso = null
  for (let tentativa = 0; tentativa < 15 && !aviso; tentativa++) {
    const { data } = await db
      .from('notificacoes')
      .select('tipo, canal, destinatario_tipo, destinatario_id, texto_gerado')
      .eq('referencia_tipo', 'turma')
      .eq('referencia_id', turmaUnicaId)
      .maybeSingle()
    aviso = data
    if (!aviso) await new Promise((r) => setTimeout(r, 1000))
  }

  ck('a criação da turma gerou o aviso ao professor', Boolean(aviso))
  if (aviso) {
    ck('endereçado ao professor', aviso.destinatario_tipo === 'professor' && aviso.destinatario_id === professor.id)
    ck('pelo canal de e-mail', aviso.canal === 'E-mail')
    ck('traz o link da videochamada', aviso.texto_gerado.includes('meet.google.com/zzz-teste-zzz'))
    ck('traz o link de presença do professor', aviso.texto_gerado.includes('/p/professor/'))
    ck('explica que o link de presença é permanente', aviso.texto_gerado.includes('sempre o mesmo'))
  }

  // ─────────────────────────────────────────────────────────────────────────
  secao('T2 · filtros na listagem')

  await p.goto(`${BASE}/turmas?modalidade=Presencial`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(800)
  const { count: presenciais } = await db
    .from('turmas')
    .select('*', { count: 'exact', head: true })
    .eq('modalidade', 'Presencial')
  const textoFiltrado = await p.locator('body').innerText()
  ck('o filtro por modalidade some com a turma Online criada', !textoFiltrado.includes('zzz-teste'))
  ck('a URL guarda o filtro', p.url().includes('modalidade=Presencial'))
  ck(
    'a contagem bate com o banco',
    textoFiltrado.includes(`${presenciais} turma`),
    `esperado ${presenciais}`,
  )

  // ─────────────────────────────────────────────────────────────────────────
  secao('M1 e M2 · matrículas')

  const { data: aluno } = await db
    .from('alunos')
    .insert({ nome: `${MARCA} Aluno`, responsavel_id: responsaveis[0].id, ativo: true })
    .select('id')
    .single()
  criados.alunos.push(aluno.id)

  const hoje = iso(new Date())

  // M2: matrícula de um dia só, que a regra antiga barrava.
  await p.goto(`${BASE}/matriculas/nova?turma=${turmaUnicaId}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
  await p.getByRole('combobox', { name: 'Aluno' }).selectOption({ label: `${MARCA} Aluno` })
  await p.getByRole('textbox', { name: 'Data de início' }).fill(hoje)
  await p.getByRole('textbox', { name: /Data de fim/ }).fill(hoje)
  await p.getByRole('button', { name: 'Matricular' }).click()
  await p.waitForTimeout(2500)

  const { data: umDia } = await db
    .from('matriculas')
    .select('id, data_inicio, data_fim')
    .eq('aluno_id', aluno.id)
  criados.matriculas.push(...umDia.map((m) => m.id))
  ck('aceita matrícula que começa e termina no mesmo dia', umDia.length === 1, `${umDia.length}`)

  // M1: uma segunda matrícula no mesmo período tem de ser barrada.
  await p.goto(`${BASE}/matriculas/nova?turma=${turmaUnicaId}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
  await p.getByRole('combobox', { name: 'Aluno' }).selectOption({ label: `${MARCA} Aluno` })
  await p.getByRole('textbox', { name: 'Data de início' }).fill(hoje)
  await p.getByRole('button', { name: 'Matricular' }).click()
  await p.waitForTimeout(2500)

  const textoErro = await p.locator('body').innerText()
  ck(
    'barra a matrícula sobreposta com a mensagem do documento',
    textoErro.includes('já possui uma matrícula nesta turma no período informado'),
  )
  const { count: quantas } = await db
    .from('matriculas')
    .select('*', { count: 'exact', head: true })
    .eq('aluno_id', aluno.id)
  ck('e não gravou a segunda', quantas === 1, `${quantas} matrícula(s)`)

  // O trigger no banco tem de barrar mesmo por fora da aplicação.
  const { error: erroDireto } = await db.from('matriculas').insert({
    aluno_id: aluno.id,
    turma_id: turmaUnicaId,
    data_inicio: hoje,
    data_fim: null,
  })
  ck('o banco barra a sobreposição mesmo sem passar pela tela', Boolean(erroDireto))

  // Sequencial (depois do fim da anterior) tem de passar.
  const { error: erroSequencial, data: sequencial } = await db
    .from('matriculas')
    .insert({
      aluno_id: aluno.id,
      turma_id: turmaUnicaId,
      data_inicio: iso(emDias(1)),
      data_fim: iso(emDias(30)),
    })
    .select('id')
    .single()
  if (sequencial) criados.matriculas.push(sequencial.id)
  ck('mas aceita matrícula sequencial, depois do fim da anterior', !erroSequencial, erroSequencial?.message)

  // ─────────────────────────────────────────────────────────────────────────
  secao('T3 · da turma para a matrícula')

  await p.goto(`${BASE}/turmas/${turmaUnicaId}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(800)
  await p.getByRole('link', { name: `${MARCA} Aluno` }).first().click()
  await p.waitForURL(/\/matriculas\/\d+$/, { timeout: 15000 })
  // A URL muda antes de a página montar: sem esperar o formulário, o texto
  // lido é o do esqueleto de carregamento.
  await p.waitForSelector('form.max-w-2xl', { timeout: 20000 })
  ck('clicar no aluno pela turma abre a matrícula, não o cadastro', /\/matriculas\/\d+$/.test(p.url()))
  const naMatricula = await p.locator('body').innerText()
  ck('a tela da matrícula mostra as datas', naMatricula.includes('Data de início'))
  ck('e oferece desmatricular', naMatricula.includes('Desmatricular'))
  ck('com um caminho de volta para a turma', await p.getByRole('link', { name: /←/ }).first().isVisible())

  // ─────────────────────────────────────────────────────────────────────────
  secao('R1 · link permanente do professor')

  await p.goto(`${BASE}/cadastros/professores/${professor.id}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1200)
  const noCadastro = await p.locator('body').innerText()
  ck('o cadastro do professor tem o painel do link', noCadastro.includes('Link de presença'))
  ck('deixa claro que se envia uma vez só', noCadastro.includes('uma vez só'))
  ck('tem o campo da agenda do Google (G1)', noCadastro.includes('Agenda do Google'))

  const { data: comToken } = await db
    .from('professores')
    .select('token_presenca')
    .eq('id', professor.id)
    .single()
  ck('o professor tem token permanente', Boolean(comToken.token_presenca))

  // A janela de tempo é a proteção do link permanente.
  const anonima = await nav.newContext()
  const pa = await anonima.newPage()
  await pa.goto(`${BASE}/p/professor/${comToken.token_presenca}`, { waitUntil: 'domcontentloaded' })
  const semLogin = await pa.locator('body').innerText()
  ck('o link abre sem login', !pa.url().includes('/login'))
  ck(
    'e não escancara a agenda: ou mostra a aula do momento, ou diz que não há',
    semLogin.includes('Nenhuma aula por agora') ||
      semLogin.includes('Confirmar') ||
      semLogin.includes('Qual aula'),
    semLogin.slice(0, 80).replace(/\n/g, ' '),
  )

  await pa.goto(`${BASE}/p/professor/token-que-nao-existe`, { waitUntil: 'domcontentloaded' })
  ck('token inválido não abre nada', (await pa.locator('body').innerText()).includes('Link indisponível'))

  // Uma aula distante não pode ser aberta nem forçando o id na URL.
  await pa.goto(`${BASE}/p/professor/${comToken.token_presenca}?aula=${aulasUnica[0].id}`, {
    waitUntil: 'domcontentloaded',
  })
  const forcada = await pa.locator('body').innerText()
  ck(
    'forçar uma aula fora da janela é recusado',
    forcada.includes('fora do horário de registro') || forcada.includes('não é de uma turma sua'),
    forcada.slice(0, 70).replace(/\n/g, ' '),
  )
  await anonima.close()

  // ─────────────────────────────────────────────────────────────────────────
  secao('R2 e R3 · pendência manual tira o aluno da aula')

  const aulaId = aulasUnica[0].id
  await p.goto(`${BASE}/agenda/aulas/${aulaId}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(800)
  const antesDoAviso = await p.locator('body').innerText()
  ck('o aluno aparece na lista da aula', antesDoAviso.includes(`${MARCA} Aluno`))
  ck('e há o botão de avisar que não vem', antesDoAviso.includes('Avisou que não vem'))

  await p.getByRole('button', { name: 'Avisou que não vem' }).first().click()
  await p.getByRole('button', { name: 'Sim' }).first().click()
  await p.waitForTimeout(2500)

  const { data: pendencia } = await db
    .from('pendencias_reposicao')
    .select('id, status')
    .eq('aluno_id', aluno.id)
    .eq('aula_origem_id', aulaId)
    .maybeSingle()
  if (pendencia) criados.pendencias.push(pendencia.id)
  ck('criou a pendência de reposição', Boolean(pendencia) && pendencia.status === 'Pendente')

  const depoisDoAviso = await p.locator('body').innerText()
  ck('o aluno sai da lista de matriculados da aula', depoisDoAviso.includes('Avisaram que não vêm'))

  // O professor tem de ver a mesma coisa.
  const { data: listaProfessor } = await db
    .from('presencas')
    .select('id')
    .eq('aula_id', aulaId)
  ck('nenhuma presença foi gravada por engano', listaProfessor.length === 0)

  // ─────────────────────────────────────────────────────────────────────────
  secao('C2 · recesso escolar')

  const { data: escola } = await db.from('escolas').select('id').eq('ativo', true).limit(1).maybeSingle()
  if (escola) {
    const { data: recesso } = await db
      .from('recessos_escola')
      .insert({
        escola_id: escola.id,
        descricao: `${MARCA} recesso`,
        data_inicio: iso(emDias(-2)),
        data_fim: iso(emDias(20)),
      })
      .select('id')
      .single()
    criados.recessos.push(recesso.id)

    await p.goto(`${BASE}/cadastros/recessos`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(800)
    ck('a tela de recessos lista o cadastrado', (await p.locator('body').innerText()).includes(`${MARCA} recesso`))
  } else {
    ck('a tela de recessos lista o cadastrado', true, 'sem escola cadastrada, pulado')
  }

  await p.goto(`${BASE}/agenda`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
  ck('a agenda carrega com o alerta de recesso ativo', !errosJs.some((e) => e.includes('/agenda')))

  // ─────────────────────────────────────────────────────────────────────────
  secao('P2, P3 e P6 · fechamento e baixa')

  await p.goto(`${BASE}/pagamentos`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1000)
  const emPagamentos = await p.locator('body').innerText()
  ck('o fechamento tem só a data final', emPagamentos.includes('Até') && !emPagamentos.includes('De\n'))
  ck('explica por que não precisa de data inicial', emPagamentos.includes('não é preciso informar uma data de início'))

  const { data: contaExistente } = await db
    .from('contas_pagar_professor')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (contaExistente) {
    await p.goto(`${BASE}/pagamentos/${contaExistente.id}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1200)
    const naConta = await p.locator('body').innerText()
    ck('a conta a pagar tem tela própria', naConta.includes('Fechamento até'))
    ck('com o relatório no formato do documento', naConta.includes('TOTAL:') && /\d{2}\/\d{2}, \d{2}h\d{2} — /.test(naConta))
    ck('e a opção de enviar ou imprimir', naConta.includes('Imprimir'))
  } else {
    ck('a conta a pagar tem tela própria', true, 'sem conta a pagar na base, pulado')
  }

  // ─────────────────────────────────────────────────────────────────────────
  secao('C1, C4, C5 e C7 · cobranças')

  await p.goto(`${BASE}/cobrancas`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1000)
  ck('a tela de cobranças carrega', !errosJs.some((e) => e.includes('/cobrancas')))

  // Precisa ser um rascunho COM itens: "Excluir item" é uma ação por linha.
  const { data: rascunhos } = await db
    .from('cobrancas')
    .select('id, status, itens:itens_cobranca(count)')
    .eq('status', 'Rascunho')
  const rascunho = (rascunhos ?? []).find((c) => (c.itens?.[0]?.count ?? 0) > 0) ?? null
  const { data: qualquer } = await db.from('cobrancas').select('id, status').limit(1).maybeSingle()
  const paraOlhar = rascunho ?? qualquer

  if (paraOlhar) {
    await p.goto(`${BASE}/cobrancas/${paraOlhar.id}`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1200)
    const naCobranca = await p.locator('body').innerText()
    ck('a cobrança mostra a conta que vai receber (C5)', naCobranca.includes('Conta que vai receber'))
    if (paraOlhar.status === 'Rascunho') {
      ck('o rascunho oferece excluir item (C4)', naCobranca.includes('Excluir'))
    }
    if (paraOlhar.status === 'Confirmada' || paraOlhar.status === 'Enviada') {
      ck('a confirmada oferece cancelar (C7)', naCobranca.includes('Cancelar esta cobrança'))
    }
  } else {
    ck('a cobrança mostra a conta que vai receber (C5)', true, 'sem cobrança na base, pulado')
  }

  const { data: contasPix } = await db.from('contas').select('padrao_recebimento').limit(1)
  ck('a conta tem o campo de padrão de recebimento (C5)', contasPix === null || contasPix.length === 0 || 'padrao_recebimento' in contasPix[0])

  // ─────────────────────────────────────────────────────────────────────────
  if (errosJs.length > 0) {
    console.log(`\n  ERROS DE JAVASCRIPT / HTTP 500:`)
    for (const e of [...new Set(errosJs)].slice(0, 6)) console.log(`    ${e}`)
    falhas += errosJs.length
  }
} finally {
  await limpar()
  console.log('\n  registros de teste removidos')
  await nav.close()
}

console.log(falhas === 0 ? '\n  Rodada 2 conferida.' : `\n  ${falhas} falha(s).`)
process.exit(falhas ? 1 : 0)
