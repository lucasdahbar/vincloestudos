/**
 * Importa o cadastro de responsaveis a partir da planilha da escola (CSV).
 *
 * A planilha segue os campos do formulario de Responsaveis. Cada valor passa
 * pelas mesmas validacoes e mascaras da tela, para o registro importado ser
 * indistinguivel de um digitado: CPF, telefone e CEP gravados com mascara,
 * CPF conferido pelo digito verificador, e-mail pelo mesmo formato.
 *
 * Campo invalido NAO derruba a linha: entra em branco e aparece no relatorio,
 * para a gestora corrigir pela tela. Perder o responsavel inteiro por causa de
 * um CPF com digito trocado seria pior do que importa-lo sem o CPF.
 *
 * Nao duplica: quem ja existe e pulado. Casa pelo CPF; sem CPF, pelo e-mail;
 * sem nenhum dos dois, pelo nome — a planilha tem gente so com nome e telefone.
 *
 * Uso:
 *   node scripts/importar-responsaveis.mjs <arquivo.csv> --ensaio    # so relata
 *   node scripts/importar-responsaveis.mjs <arquivo.csv> --confirmo  # grava
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  cpfValido,
  mascaraCep,
  mascaraCpf,
  mascaraTelefone,
  somenteDigitos,
} from '../src/dominio/documentos/formato.ts'

function carregarEnv(caminho = '.env.local') {
  const env = {}
  for (const linha of readFileSync(caminho, 'utf8').split('\n')) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const [arquivo] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const ENSAIO = process.argv.includes('--ensaio')
if (!arquivo || (!ENSAIO && !process.argv.includes('--confirmo'))) {
  console.error('Uso: node scripts/importar-responsaveis.mjs <arquivo.csv> --ensaio | --confirmo')
  process.exit(1)
}

/**
 * O Excel no Windows salva CSV em Windows-1252, nao UTF-8. Lido como UTF-8, o
 * "Antônio" vira "Ant�nio" e o nome entra estragado no banco. Tenta UTF-8 e,
 * se aparecer caractere invalido, relê como Windows-1252.
 */
function lerTexto(caminho) {
  const bytes = readFileSync(caminho)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8
}

/** Para casar cabecalhos sem depender de acento, espaco ou maiuscula. */
const chave = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

const COLUNAS = {
  nome: 'nome',
  telefonewhatsapp: 'telefone',
  telefone: 'telefone',
  email: 'email',
  cpf: 'cpf',
  cep: 'cep',
  logradouro: 'endereco',
  numero: 'numero',
  complemento: 'complemento',
  bairro: 'bairro',
  cidade: 'cidade',
  estadouf: 'estado',
  uf: 'estado',
  estado: 'estado',
  observacoes: 'observacao',
}

const linhas = lerTexto(arquivo).split(/\r?\n/)
const separador = linhas.find((l) => /;/.test(l)) ? ';' : ','

// A planilha tem titulo e linhas em branco antes do cabecalho.
const iCabecalho = linhas.findIndex((l) => chave(l.split(separador)[0] ?? '') === 'nome')
if (iCabecalho < 0) {
  console.error('Nao achei a linha de cabecalho (a que comeca com "Nome").')
  process.exit(1)
}

const cabecalho = linhas[iCabecalho].split(separador).map((c) => COLUNAS[chave(c)] ?? null)
const faltando = ['nome'].filter((c) => !cabecalho.includes(c))
if (faltando.length) {
  console.error(`Faltam colunas: ${faltando.join(', ')}`)
  process.exit(1)
}

const registros = []
const avisos = []

linhas.slice(iCabecalho + 1).forEach((linha, i) => {
  const numLinha = iCabecalho + 2 + i
  const valores = linha.split(separador)
  const bruto = {}
  cabecalho.forEach((campo, j) => {
    if (campo) bruto[campo] = (valores[j] ?? '').trim().replace(/\s+/g, ' ')
  })
  if (!bruto.nome) return // linha vazia do fim da planilha

  const r = { nome: bruto.nome, ativo: true }
  const avisar = (msg) => avisos.push(`linha ${numLinha} (${bruto.nome}): ${msg}`)

  if (bruto.telefone) {
    const d = somenteDigitos(bruto.telefone)
    if (d.length === 10 || d.length === 11) r.telefone = mascaraTelefone(d)
    else avisar(`telefone "${bruto.telefone}" incompleto, importado sem telefone`)
  }

  if (bruto.email) {
    const e = bruto.email.toLowerCase().replace(/\s/g, '')
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) r.email = e
    else avisar(`e-mail "${bruto.email}" invalido, importado sem e-mail`)
  }

  if (bruto.cpf) {
    if (cpfValido(bruto.cpf)) r.cpf = mascaraCpf(somenteDigitos(bruto.cpf))
    else avisar(`CPF "${bruto.cpf}" invalido, importado sem CPF`)
  }

  if (bruto.cep) {
    const d = somenteDigitos(bruto.cep)
    if (d.length === 8) r.cep = mascaraCep(d)
    else avisar(`CEP "${bruto.cep}" invalido, importado sem CEP`)
  }

  if (bruto.estado) {
    const uf = bruto.estado.toUpperCase()
    if (/^[A-Z]{2}$/.test(uf)) r.estado = uf
    else avisar(`UF "${bruto.estado}" invalida, importada sem UF`)
  }

  for (const campo of ['endereco', 'numero', 'complemento', 'bairro', 'cidade', 'observacao']) {
    if (bruto[campo]) r[campo] = bruto[campo]
  }

  registros.push({ numLinha, r })
})

// Repeticao dentro da propria planilha: provavelmente a mesma pessoa duas vezes.
for (const campo of ['cpf', 'email']) {
  const vistos = new Map()
  for (const { numLinha, r } of registros) {
    if (!r[campo]) continue
    if (vistos.has(r[campo])) {
      avisos.push(
        `linha ${numLinha} (${r.nome}): mesmo ${campo === 'cpf' ? 'CPF' : 'e-mail'} da linha ${vistos.get(r[campo])} — confira se nao e a mesma pessoa`,
      )
    } else vistos.set(r[campo], numLinha)
  }
}

const env = carregarEnv()
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: existentes, error } = await db.from('responsaveis').select('nome, cpf, email')
if (error) {
  console.error(`Falha ao ler os responsaveis: ${error.message}`)
  process.exit(1)
}
const cpfs = new Set(existentes.map((e) => e.cpf).filter(Boolean))
const emails = new Set(existentes.map((e) => e.email?.toLowerCase()).filter(Boolean))
const nomes = new Set(existentes.map((e) => chave(e.nome)))

const novos = registros.filter(({ r }) => {
  if (r.cpf) return !cpfs.has(r.cpf)
  if (r.email) return !emails.has(r.email)
  return !nomes.has(chave(r.nome))
})

const semContato = registros.filter(({ r }) => !r.telefone && !r.email)

console.log(`Linhas com nome: ${registros.length}`)
console.log(`Ja cadastrados (pulados): ${registros.length - novos.length}`)
console.log(`Para importar: ${novos.length}`)
console.log(`Sem telefone nem e-mail (nao recebem mensagem): ${semContato.length}`)
for (const { numLinha, r } of semContato) console.log(`  linha ${numLinha}: ${r.nome}`)

console.log(`\nAvisos: ${avisos.length}`)
for (const a of avisos) console.log(`  ${a}`)

if (ENSAIO) {
  // Para conferir a olho acento, mascara e o casamento das colunas.
  console.log('\nAmostra do que seria gravado:')
  for (const { r } of novos.slice(0, 3)) console.log(`  ${JSON.stringify(r)}`)
  console.log('\nEnsaio: nada foi gravado.')
  process.exit(0)
}

// Em lotes, para uma falha no meio nao deixar a importacao pela metade sem aviso.
let gravados = 0
for (let i = 0; i < novos.length; i += 50) {
  const lote = novos.slice(i, i + 50).map(({ r }) => r)
  const { error: e } = await db.from('responsaveis').insert(lote)
  if (e) {
    console.error(`\nFalha no lote a partir da linha ${novos[i].numLinha}: ${e.message}`)
    console.error(`Gravados antes da falha: ${gravados}. Rode de novo: os ja gravados sao pulados.`)
    process.exit(1)
  }
  gravados += lote.length
}

const { count } = await db.from('responsaveis').select('id', { count: 'exact', head: true })
console.log(`\nImportados: ${gravados}. Total de responsaveis no banco: ${count}.`)
