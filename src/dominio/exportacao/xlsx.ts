/**
 * Gera um .xlsx de uma aba so, com o cabecalho em negrito e congelado.
 *
 * Feito a mao em vez de puxar uma biblioteca: a exportacao para a nota fiscal
 * (pedido do Julio, 24/10/2026) so precisa de texto em celulas, e um .xlsx e um
 * zip com meia duzia de XMLs. As bibliotecas que leem e escrevem Excel pesam
 * megabytes e a do SheetJS saiu do npm.
 *
 * Toda celula e gravada como texto (`inlineStr`): CPF e CEP com zero a
 * esquerda e o numero "045" do endereco nao podem virar numero no Excel.
 */

export interface ColunaXlsx {
  titulo: string
  /** Em caracteres, como o Excel mede. */
  largura: number
}

export interface PlanilhaXlsx {
  aba: string
  colunas: ColunaXlsx[]
  linhas: string[][]
}

export function gerarXlsx({ aba, colunas, linhas }: PlanilhaXlsx): Uint8Array {
  return zipar([
    ['[Content_Types].xml', TIPOS],
    ['_rels/.rels', RELS],
    ['xl/workbook.xml', pastaDeTrabalho(aba)],
    ['xl/_rels/workbook.xml.rels', RELS_DA_PASTA],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', folha(colunas, linhas)],
  ])
}

// ── XML ─────────────────────────────────────────────────────────────────────

const CABECALHO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const TIPOS =
  CABECALHO_XML +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const RELS =
  CABECALHO_XML +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>'

const RELS_DA_PASTA =
  CABECALHO_XML +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/>` +
  '</Relationships>'

// Estilo 0 e o padrao; o 1 e o negrito do cabecalho.
const ESTILOS =
  CABECALHO_XML +
  `<styleSheet xmlns="${NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

function pastaDeTrabalho(aba: string): string {
  return (
    CABECALHO_XML +
    `<workbook xmlns="${NS}" xmlns:r="${NS_REL}">` +
    `<sheets><sheet name="${escapar(aba)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>'
  )
}

function folha(colunas: ColunaXlsx[], linhas: string[][]): string {
  const larguras = colunas
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura}" customWidth="1"/>`)
    .join('')
  const todas = [colunas.map((c) => c.titulo), ...linhas]
  const corpo = todas
    .map((linha, i) => {
      const r = i + 1
      const estilo = r === 1 ? ' s="1"' : ''
      const celulas = linha
        .map((valor, j) =>
          valor
            ? `<c r="${letraDaColuna(j)}${r}" t="inlineStr"${estilo}><is><t>${escapar(valor)}</t></is></c>`
            : '',
        )
        .join('')
      return `<row r="${r}">${celulas}</row>`
    })
    .join('')
  return (
    CABECALHO_XML +
    `<worksheet xmlns="${NS}">` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    `<cols>${larguras}</cols>` +
    `<sheetData>${corpo}</sheetData>` +
    '</worksheet>'
  )
}

/** 0 → A, 25 → Z, 26 → AA. */
function letraDaColuna(indice: number): string {
  let n = indice + 1
  let letras = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    n = Math.floor((n - 1) / 26)
  }
  return letras
}

function escapar(texto: string): string {
  return (
    texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Caractere de controle invalida o XML e o Excel recusa o arquivo inteiro.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  )
}

// ── Zip ─────────────────────────────────────────────────────────────────────
// Sem compressao (metodo "stored"): 250 responsaveis dao menos de 100 KB.

function zipar(arquivos: [string, string][]): Uint8Array {
  const codificador = new TextEncoder()
  const locais: Uint8Array[] = []
  const centrais: Uint8Array[] = []
  let deslocamento = 0

  for (const [nome, conteudo] of arquivos) {
    const nomeBytes = codificador.encode(nome)
    const dados = codificador.encode(conteudo)
    const crc = crc32(dados)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // versao necessaria
    local.setUint16(6, 0x0800, true) // nomes em UTF-8
    local.setUint32(14, crc, true)
    local.setUint32(18, dados.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, nomeBytes.length, true)
    locais.push(new Uint8Array(local.buffer), nomeBytes, dados)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, dados.length, true)
    central.setUint32(24, dados.length, true)
    central.setUint16(28, nomeBytes.length, true)
    central.setUint32(42, deslocamento, true)
    centrais.push(new Uint8Array(central.buffer), nomeBytes)

    deslocamento += 30 + nomeBytes.length + dados.length
  }

  const tamanhoCentral = centrais.reduce((s, b) => s + b.length, 0)
  const fim = new DataView(new ArrayBuffer(22))
  fim.setUint32(0, 0x06054b50, true)
  fim.setUint16(8, arquivos.length, true)
  fim.setUint16(10, arquivos.length, true)
  fim.setUint32(12, tamanhoCentral, true)
  fim.setUint32(16, deslocamento, true)

  return juntar([...locais, ...centrais, new Uint8Array(fim.buffer)])
}

function juntar(partes: Uint8Array[]): Uint8Array {
  const total = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let p = 0
  for (const parte of partes) {
    total.set(parte, p)
    p += parte.length
  }
  return total
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(dados: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of dados) crc = TABELA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
