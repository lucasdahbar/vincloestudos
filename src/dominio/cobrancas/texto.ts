import { formatarBRL, somar, type Centavos } from '@/dominio/dinheiro'

export interface ItemDoTexto {
  aluno_nome: string
  /** Ano escolar e materia, como "9º ano — Matemática". */
  contexto: string
  descricao: string
  data: string
  valor_final: Centavos
}

export interface DadosDoTexto {
  responsavel_nome: string
  /** Primeiro dia do mes, em ISO. */
  mes_referencia: string
  valor_total: Centavos
  chave_pix: string | null
  /** Data de vencimento em ISO. */
  vencimento: string
  itens: ItemDoTexto[]
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function mesPorExtenso(iso: string): string {
  const [ano, mes] = iso.split('-').map(Number)
  return `${MESES[mes - 1]}/${ano}`
}

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

function dataCompleta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Largura da coluna de pontinhos, para os valores alinharem no WhatsApp. */
const LARGURA = 38

/**
 * Modulos Operacionais 6.4. Monta o texto pronto para a gestora copiar e enviar,
 * agrupando por aluno e, dentro de cada aluno, resumindo itens iguais com a
 * quantidade e o intervalo de datas.
 *
 * O valor exibido no total e sempre o valor_total, ja liquido de descontos.
 */
export function gerarTextoCobranca(dados: DadosDoTexto): string {
  const primeiroNome = dados.responsavel_nome.trim().split(/\s+/)[0]
  const linhas: string[] = [
    `Olá, ${primeiroNome}! Segue a cobrança referente a ${mesPorExtenso(dados.mes_referencia)}:`,
    '',
  ]

  // Agrupa por aluno preservando a ordem de entrada.
  const porAluno = new Map<string, ItemDoTexto[]>()
  for (const item of dados.itens) {
    const chave = `${item.aluno_nome}|${item.contexto}`
    porAluno.set(chave, [...(porAluno.get(chave) ?? []), item])
  }

  for (const [chave, doAluno] of porAluno) {
    const [nome, contexto] = chave.split('|')
    linhas.push(`${nome} (${contexto})`)

    // Dentro do aluno, resume itens com a mesma descricao.
    const porDescricao = new Map<string, ItemDoTexto[]>()
    for (const item of doAluno) {
      porDescricao.set(item.descricao, [...(porDescricao.get(item.descricao) ?? []), item])
    }

    for (const [descricao, grupo] of porDescricao) {
      const datas = grupo.map((g) => g.data).sort()
      const periodo =
        grupo.length > 1 ? ` (${dataCurta(datas[0])} a ${dataCurta(datas[datas.length - 1])})` : ''
      const rotulo = `${grupo.length}x ${descricao}${periodo}`
      const valor = formatarBRL(somar(...grupo.map((g) => g.valor_final)))
      const pontos = '.'.repeat(Math.max(1, LARGURA - rotulo.length))
      linhas.push(`${rotulo} ${pontos} ${valor}`)
    }

    linhas.push('')
  }

  linhas.push(`TOTAL: ${formatarBRL(dados.valor_total)}`)
  linhas.push('')

  const rodape = dados.chave_pix
    ? `Pix: ${dados.chave_pix} — Vencimento: ${dataCompleta(dados.vencimento)}`
    : `Vencimento: ${dataCompleta(dados.vencimento)}`
  linhas.push(rodape)

  return linhas.join('\n')
}
