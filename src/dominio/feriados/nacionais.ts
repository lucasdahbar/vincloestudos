/**
 * Feriados nacionais pela BrasilAPI.
 *
 * Sugestao do QA: em vez de a gestora digitar os mesmos feriados nacionais todo
 * ano, buscar de uma fonte publica. A API e gratuita e sem autenticacao, no
 * mesmo padrao do ViaCEP que ja usamos no endereco.
 *
 * A tela manual continua: a API cobre apenas feriados NACIONAIS. Estaduais,
 * municipais e pontos facultativos — que sao justamente os que variam pela
 * cidade da gestora — seguem sendo cadastrados a mao.
 */
export interface FeriadoNacional {
  /** Data em ISO, AAAA-MM-DD. */
  data: string
  nome: string
}

export type ResultadoFeriados =
  | { ok: true; feriados: FeriadoNacional[] }
  | { ok: false; motivo: string }

const TEMPO_LIMITE_MS = 8000

/** Anos fora desta faixa a API nao cobre, e nao ha por que perguntar. */
const ANO_MIN = 1900
const ANO_MAX = 2199

/**
 * `buscar` é injetável para o teste não depender de rede — a regra que importa
 * (ano fora da faixa, resposta vazia, timeout) é a mesma seja qual for o
 * transporte.
 */
export async function buscarFeriadosNacionais(
  ano: number,
  buscar: (url: string, sinal: AbortSignal) => Promise<Response> = (url, signal) =>
    fetch(url, { signal }),
): Promise<ResultadoFeriados> {
  if (!Number.isInteger(ano) || ano < ANO_MIN || ano > ANO_MAX) {
    return { ok: false, motivo: `Ano inválido. Use um ano entre ${ANO_MIN} e ${ANO_MAX}.` }
  }

  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS)

  try {
    const resposta = await buscar(
      `https://brasilapi.com.br/api/feriados/v1/${ano}`,
      controle.signal,
    )

    if (resposta.status === 404) {
      return { ok: false, motivo: `A consulta não tem feriados para ${ano}.` }
    }
    if (!resposta.ok) {
      return { ok: false, motivo: 'Não deu para consultar os feriados agora. Tente mais tarde.' }
    }

    const dados = await resposta.json()
    if (!Array.isArray(dados)) {
      return { ok: false, motivo: 'A consulta respondeu em formato inesperado.' }
    }

    const feriados = dados
      .filter(
        (f): f is { date: string; name: string } =>
          typeof f?.date === 'string' && typeof f?.name === 'string',
      )
      // O ano pedido e o que vale: uma resposta com data de outro ano seria erro
      // da fonte, e entraria no calendario da gestora sem ela perceber.
      .filter((f) => f.date.startsWith(`${ano}-`))
      .map((f) => ({ data: f.date, nome: capitalizar(f.name.trim()) }))

    if (feriados.length === 0) {
      return { ok: false, motivo: `Nenhum feriado nacional encontrado para ${ano}.` }
    }

    return { ok: true, feriados }
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === 'AbortError'
    return {
      ok: false,
      motivo: abortou
        ? 'A consulta de feriados demorou demais. Tente de novo ou cadastre à mão.'
        : 'Não deu para consultar os feriados agora. Tente mais tarde.',
    }
  } finally {
    clearTimeout(relogio)
  }
}

/** A API mistura "Confraternização mundial" e "Natal": padroniza a primeira letra. */
function capitalizar(nome: string): string {
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/**
 * Quais feriados ainda faltam. Compara por DATA, nao por nome: se a gestora ja
 * cadastrou o dia 25/12 como "Natal" e a API chama de "Natal do Senhor", o dia
 * nao pode aparecer duas vezes no calendario dela.
 */
export function feriadosQueFaltam(
  daApi: FeriadoNacional[],
  datasJaCadastradas: string[],
): FeriadoNacional[] {
  const existentes = new Set(datasJaCadastradas)
  return daApi.filter((f) => !existentes.has(f.data))
}
