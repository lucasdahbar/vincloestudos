import { crc32, inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { gerarXlsx } from './xlsx'

/** Le o zip gerado pelo diretorio central, como o Excel faz. */
function lerZip(bytes: Uint8Array): Map<string, string> {
  const buf = Buffer.from(bytes)
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  expect(fim).toBeGreaterThan(0)
  const total = buf.readUInt16LE(fim + 10)
  let p = buf.readUInt32LE(fim + 16)
  const arquivos = new Map<string, string>()
  for (let i = 0; i < total; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50)
    const metodo = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const tamanho = buf.readUInt32LE(p + 20)
    const nomeLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const comentLen = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const nome = buf.subarray(p + 46, p + 46 + nomeLen).toString('utf8')
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const dados = buf.subarray(inicio, inicio + tamanho)
    const conteudo = metodo === 8 ? inflateRawSync(dados) : dados
    expect(crc32(conteudo) >>> 0).toBe(crc)
    arquivos.set(nome, conteudo.toString('utf8'))
    p += 46 + nomeLen + extraLen + comentLen
  }
  return arquivos
}

describe('gerarXlsx', () => {
  const xlsx = gerarXlsx({
    aba: 'Clientes',
    colunas: [
      { titulo: 'Nome', largura: 40 },
      { titulo: 'CPF', largura: 20 },
    ],
    linhas: [
      ['Ana & Filhos <Ltda>', '012.345.678-90'],
      ['João "Jô"', ''],
    ],
  })
  const arquivos = lerZip(xlsx)

  it('tem as partes mínimas de uma pasta de trabalho, com CRC válido', () => {
    expect([...arquivos.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
    expect(arquivos.get('xl/workbook.xml')).toContain('<sheet name="Clientes"')
  })

  it('grava tudo como texto, para CPF e CEP não perderem o zero à esquerda', () => {
    const folha = arquivos.get('xl/worksheets/sheet1.xml')!
    expect(folha).toContain('<c r="B2" t="inlineStr"><is><t>012.345.678-90</t></is></c>')
    expect(folha).not.toMatch(/<v>/)
  })

  it('escapa os caracteres especiais do XML e mantém acentos', () => {
    const folha = arquivos.get('xl/worksheets/sheet1.xml')!
    expect(folha).toContain('Ana &amp; Filhos &lt;Ltda&gt;')
    expect(folha).toContain('João &quot;Jô&quot;')
  })

  it('cabeçalho em negrito, congelado, e com a largura das colunas', () => {
    const folha = arquivos.get('xl/worksheets/sheet1.xml')!
    expect(folha).toContain('<c r="A1" t="inlineStr" s="1"><is><t>Nome</t></is></c>')
    expect(folha).toContain('state="frozen"')
    expect(folha).toContain('<col min="1" max="1" width="40" customWidth="1"/>')
  })

  it('célula vazia não é gravada', () => {
    const folha = arquivos.get('xl/worksheets/sheet1.xml')!
    expect(folha).not.toContain('r="B3"')
    expect(folha).toContain('<row r="3"><c r="A3"')
  })
})
