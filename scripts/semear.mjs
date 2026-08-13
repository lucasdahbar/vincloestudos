/**
 * Popula o banco com dados ficticios para a gestora explorar o sistema.
 *
 * Usa a service_role key via PostgREST, em vez de `supabase db push --include-seed`,
 * porque o seed do CLI depende do token de gerenciamento da conta — este script
 * depende apenas das chaves do projeto, que estao no .env.local.
 *
 * Uso:
 *   node scripts/semear.mjs           # limpa e popula
 *   node scripts/semear.mjs --limpar  # apenas limpa
 *
 * Limpar apaga TODOS os dados de negocio, na ordem inversa das dependencias.
 * Nao mexe em usuarios de login (schema auth) nem em perfis.
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

/** Insere e devolve as linhas criadas, abortando com mensagem clara em caso de erro. */
async function inserir(tabela, linhas) {
  const { data, error } = await db.from(tabela).insert(linhas).select()
  if (error) {
    console.error(`Falha ao inserir em ${tabela}: ${error.message}`)
    process.exit(1)
  }
  console.log(`  ${tabela}: ${data.length}`)
  return data
}

// Ordem inversa das dependencias: filhos antes dos pais.
const ORDEM_LIMPEZA = [
  'matriculas',
  'turmas',
  'alunos',
  'responsaveis',
  'professor_percentual_historico',
  'professores',
  'servico_valor_historico',
  'servicos',
  'escolas',
  'materias',
  'anos_escolares',
  'contas',
  'feriados',
  'cidades',
]

async function limpar() {
  console.log('Limpando dados de negocio...')
  for (const tabela of ORDEM_LIMPEZA) {
    const { error } = await db.from(tabela).delete().gte('id', 0)
    if (error) {
      console.error(`Falha ao limpar ${tabela}: ${error.message}`)
      process.exit(1)
    }
  }
  console.log('Limpo.')
}

async function semear() {
  console.log('Populando...')

  const cidades = await inserir('cidades', [
    { nome: 'Campinas', uf: 'SP' },
    { nome: 'Valinhos', uf: 'SP' },
  ])
  const campinas = cidades.find((c) => c.nome === 'Campinas').id
  const valinhos = cidades.find((c) => c.nome === 'Valinhos').id

  const escolas = await inserir('escolas', [
    { nome: 'Colégio São José', cidade_id: campinas, telefone: '(19) 3232-1010' },
    { nome: 'Escola Nova Era', cidade_id: campinas, telefone: '(19) 3232-2020' },
  ])
  const saoJose = escolas[0].id
  const novaEra = escolas[1].id

  const anos = await inserir('anos_escolares', [
    { nome: '6º ano — Fundamental', ordem: 6 },
    { nome: '7º ano — Fundamental', ordem: 7 },
    { nome: '8º ano — Fundamental', ordem: 8 },
    { nome: '9º ano — Fundamental', ordem: 9 },
    { nome: '1ª série — Médio', ordem: 10 },
  ])
  const ano7 = anos.find((a) => a.ordem === 7).id
  const ano9 = anos.find((a) => a.ordem === 9).id
  const ano1medio = anos.find((a) => a.ordem === 10).id

  const materias = await inserir('materias', [
    { nome: 'Matemática' },
    { nome: 'Português' },
    { nome: 'Física' },
    { nome: 'Química' },
    { nome: 'Inglês' },
  ])
  const matematica = materias.find((m) => m.nome === 'Matemática').id
  const portugues = materias.find((m) => m.nome === 'Português').id
  const fisica = materias.find((m) => m.nome === 'Física').id

  // O historico de vigencia destes valores e preenchido por trigger.
  const servicos = await inserir('servicos', [
    { nome: 'Aula regular', valor_padrao: '100.00', permite_materia: true, permite_escola: true },
    { nome: 'Aulão de revisão', valor_padrao: '105.00', permite_materia: true, permite_escola: false },
    { nome: 'Aula particular', valor_padrao: '130.00', permite_materia: true, permite_escola: false },
  ])
  const aulaRegular = servicos[0].id
  const aulaParticular = servicos[2].id

  await inserir('contas', [
    { nome: 'Conta principal', tipo: 'Banco', banco: 'Nubank', chave_pix: 'mesinharedonda@email.com' },
    { nome: 'Dinheiro em espécie', tipo: 'Dinheiro' },
  ])

  await inserir('feriados', [
    { data: '2026-09-07', nome: 'Independência do Brasil', abrangencia: 'Nacional' },
    { data: '2026-10-12', nome: 'Nossa Senhora Aparecida', abrangencia: 'Nacional' },
    { data: '2026-11-02', nome: 'Finados', abrangencia: 'Nacional' },
    { data: '2026-11-15', nome: 'Proclamação da República', abrangencia: 'Nacional' },
  ])

  const professores = await inserir('professores', [
    {
      nome: 'Beatriz Lima',
      percentual_repasse: '60.00',
      telefone: '(19) 99811-1122',
      email: 'beatriz@exemplo.com',
      chave_pix: 'beatriz@exemplo.com',
    },
    {
      nome: 'Carlos Menezes',
      percentual_repasse: '55.00',
      telefone: '(19) 99822-3344',
      email: 'carlos@exemplo.com',
      chave_pix: '(19) 99822-3344',
    },
  ])
  const beatriz = professores[0].id
  const carlos = professores[1].id

  const responsaveis = await inserir('responsaveis', [
    { nome: 'Ana Ribeiro', telefone: '(19) 99700-1111', email: 'ana@exemplo.com', cidade_id: campinas },
    { nome: 'Marcos Tavares', telefone: '(19) 99700-2222', email: 'marcos@exemplo.com', cidade_id: campinas },
    { nome: 'Juliana Prado', telefone: '(19) 99700-3333', email: 'juliana@exemplo.com', cidade_id: valinhos },
  ])
  const ana = responsaveis[0].id
  const marcos = responsaveis[1].id
  const juliana = responsaveis[2].id

  const alunos = await inserir('alunos', [
    { nome: 'João Ribeiro', responsavel_id: ana, escola_id: saoJose, destinatario_notificacao: 'Responsável', canal_notificacao: 'WhatsApp' },
    { nome: 'Maria Ribeiro', responsavel_id: ana, escola_id: saoJose, destinatario_notificacao: 'Ambos', canal_notificacao: 'WhatsApp' },
    { nome: 'Pedro Tavares', responsavel_id: marcos, escola_id: novaEra, destinatario_notificacao: 'Responsável', canal_notificacao: 'E-mail' },
    { nome: 'Laura Prado', responsavel_id: juliana, escola_id: saoJose, destinatario_notificacao: 'Aluno', canal_notificacao: 'WhatsApp' },
  ])
  const [joao, maria, pedro, laura] = alunos.map((a) => a.id)

  // O nome segue a regra de concatenacao do Adendo 5.2:
  // Materia + Ano Escolar + Escola + Servico + Modalidade.
  const turmas = await inserir('turmas', [
    {
      nome: 'Matemática · 9º ano — Fundamental · Colégio São José · Aula regular · Presencial',
      servico_id: aulaRegular, materia_id: matematica, escola_id: saoJose,
      ano_escolar_id: ano9, professor_id: beatriz, modalidade: 'Presencial',
      dias_semana: [2, 4], horario_inicio: '15:00', horario_fim: '16:00',
    },
    {
      nome: 'Português · 7º ano — Fundamental · Colégio São José · Aula regular · Presencial',
      servico_id: aulaRegular, materia_id: portugues, escola_id: saoJose,
      ano_escolar_id: ano7, professor_id: carlos, modalidade: 'Presencial',
      dias_semana: [3, 5], horario_inicio: '14:00', horario_fim: '15:00',
    },
    {
      nome: 'Física · 1ª série — Médio · Aula particular · Online',
      servico_id: aulaParticular, materia_id: fisica, escola_id: null,
      ano_escolar_id: ano1medio, professor_id: beatriz, modalidade: 'Online',
      dias_semana: [1], horario_inicio: '18:00', horario_fim: '19:00',
    },
  ])
  const [turmaMat, turmaPort, turmaFisica] = turmas.map((t) => t.id)

  await inserir('matriculas', [
    { aluno_id: joao, turma_id: turmaMat, data_inicio: '2026-08-01' },
    { aluno_id: maria, turma_id: turmaPort, data_inicio: '2026-08-01' },
    { aluno_id: pedro, turma_id: turmaMat, data_inicio: '2026-08-03' },
    { aluno_id: laura, turma_id: turmaFisica, data_inicio: '2026-08-05' },
  ])

  console.log('\nPopulado. Conferindo os historicos preenchidos por trigger:')
  for (const t of ['servico_valor_historico', 'professor_percentual_historico']) {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true })
    console.log(`  ${t}: ${count}`)
  }
}

await limpar()
if (!process.argv.includes('--limpar')) await semear()
