/**
 * Textos de mensagem editaveis pela gestora (pedido de 03/11/2026).
 *
 * O texto e escrito com campos entre chaves, como `{nome}`; aqui so se troca e
 * se confere. Nao ha logica dentro do texto (nada de "se online, entao"): uma
 * parte que depende da situacao vira um campo que chega ja pronto ou vazio.
 */

const CAMPO = /\{(\w+)\}/g

/** Os campos que o texto usa, sem repetir, na ordem em que aparecem. */
export function camposUsados(modelo: string): string[] {
  const achados = [...modelo.matchAll(CAMPO)].map((m) => m[1])
  return [...new Set(achados)]
}

/**
 * Troca cada `{campo}` pelo valor.
 *
 * Campo que o sistema nao conhece fica como esta: sumir calado esconderia o
 * erro; deixar `{nom}` no texto o torna visivel na previa. Valores nunca passam
 * por `String.replace` com texto, porque `$&` e `$1` no valor (um nome, um
 * valor em reais) seriam lidos como padrao de troca.
 *
 * A linha que tinha so campos e que ficou vazia sai inteira. E o que deixa o
 * aviso "o link da sala chega antes da aula" existir so na turma online sem
 * deixar um buraco na turma presencial. A linha em branco que o autor escreveu
 * de proposito fica, mas nunca duas seguidas.
 */
export function preencher(modelo: string, valores: Record<string, string>): string {
  const linhas: string[] = []

  for (const linha of modelo.split('\n')) {
    const tinhaCampo = new RegExp(CAMPO.source).test(linha)
    const nova = linha.replace(CAMPO, (inteiro, nome: string) =>
      Object.prototype.hasOwnProperty.call(valores, nome) ? valores[nome] : inteiro,
    )

    if (tinhaCampo && nova.trim() === '') continue
    linhas.push(nova)
  }

  // Duas linhas em branco seguidas viram uma (sobram quando sai a linha do meio).
  const compactado: string[] = []
  for (const linha of linhas) {
    const anterior = compactado[compactado.length - 1]
    if (linha.trim() === '' && anterior !== undefined && anterior.trim() === '') continue
    compactado.push(linha)
  }

  return compactado.join('\n').trim()
}

/**
 * Os problemas do texto, em portugues, prontos para mostrar na tela. Lista
 * vazia = pode salvar.
 *
 * `obrigatorios` sao os campos sem os quais a mensagem perde o sentido (o link
 * do link da aula): sem eles a gestora mandaria a familia uma mensagem vazia.
 */
export function validarModelo(
  modelo: string,
  camposDaMensagem: string[],
  obrigatorios: string[],
): string[] {
  if (modelo.trim() === '') return ['O texto não pode ficar vazio.']

  const problemas: string[] = []
  const usados = camposUsados(modelo)

  for (const campo of usados) {
    if (!camposDaMensagem.includes(campo)) {
      problemas.push(`O campo {${campo}} não existe nesta mensagem.`)
    }
  }

  for (const campo of obrigatorios) {
    if (!usados.includes(campo)) {
      problemas.push(
        `Falta o campo {${campo}}: sem ele a mensagem sai sem a informação principal.`,
      )
    }
  }

  // Sobrou chave depois de tirar os campos validos: `{nome` sem fechar, `nome}`.
  if (/[{}]/.test(modelo.replace(CAMPO, ''))) {
    problemas.push('Há uma chave { ou } sem par. Os campos têm o formato {nome}.')
  }

  return problemas
}
