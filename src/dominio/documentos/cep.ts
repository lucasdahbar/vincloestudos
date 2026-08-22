/**
 * Busca de endereco por CEP (Requisitos v1.0, Secoes 5.2 e 9).
 *
 * Comportamento especificado: dispara ao sair do campo, preenche endereco,
 * bairro, cidade e estado, e deixa tudo editavel depois. CEP inexistente tem
 * mensagem propria; se a API nao responder em 5 segundos, o preenchimento
 * manual continua liberado — a gestora nunca fica presa esperando.
 */
export interface EnderecoDoCep {
  endereco: string
  bairro: string
  cidade: string
  estado: string
}

export type ResultadoCep =
  | { ok: true; endereco: EnderecoDoCep }
  | { ok: false; motivo: string }

const TEMPO_LIMITE_MS = 5000

export function normalizarCep(valor: string): string {
  return valor.replace(/\D/g, '')
}

/**
 * `buscar` é injetável para o teste não depender de rede — a regra que importa
 * (timeout, CEP inexistente, resposta malformada) é a mesma seja qual for o
 * transporte.
 */
export async function buscarCep(
  cep: string,
  buscar: (url: string, sinal: AbortSignal) => Promise<Response> = (url, signal) =>
    fetch(url, { signal }),
): Promise<ResultadoCep> {
  const limpo = normalizarCep(cep)
  if (limpo.length !== 8) {
    return { ok: false, motivo: 'O CEP precisa ter 8 dígitos.' }
  }

  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)

  try {
    const resposta = await buscar(`https://viacep.com.br/ws/${limpo}/json/`, controle.signal)
    if (!resposta.ok) {
      return { ok: false, motivo: 'Não deu para consultar o CEP agora. Preencha à mão.' }
    }

    const dados = (await resposta.json()) as {
      erro?: boolean | string
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
    }

    // O ViaCEP responde 200 com `erro: true` quando o CEP nao existe.
    if (dados.erro) {
      return { ok: false, motivo: 'CEP não encontrado. Confira o número ou preencha à mão.' }
    }

    return {
      ok: true,
      endereco: {
        endereco: dados.logradouro ?? '',
        bairro: dados.bairro ?? '',
        cidade: dados.localidade ?? '',
        estado: (dados.uf ?? '').toUpperCase(),
      },
    }
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === 'AbortError'
    return {
      ok: false,
      motivo: abortou
        ? 'A consulta de CEP demorou demais. Preencha o endereço à mão.'
        : 'Não deu para consultar o CEP agora. Preencha à mão.',
    }
  } finally {
    clearTimeout(relogio)
  }
}
