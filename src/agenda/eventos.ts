import 'server-only'
import { accessToken } from './credenciais'
import { FUSO, montarEvento, type TurmaDoEvento } from '@/dominio/agenda/evento-google'
import type { OcorrenciaNoGoogle } from '@/dominio/agenda/ocorrencias'

/**
 * G2 (Rodada 2): cria ou atualiza o evento da turma na agenda do professor.
 *
 * Substitui o trecho da Seção 4.3 dos Módulos Operacionais que previa só
 * leitura: a gestora não precisa mais criar o evento à mão.
 *
 * Toda função aqui devolve resultado em vez de estourar. Salvar a turma não
 * pode falhar porque o Google estava fora do ar — a turma é o dado do negócio,
 * o evento é reflexo dela.
 */

const API = 'https://www.googleapis.com/calendar/v3/calendars'

export type ResultadoEvento =
  | { ok: true; eventoId: string }
  | { ok: false; motivo: string }

export interface DadosDoEvento extends TurmaDoEvento {
  /** Agenda do professor (G1). Sem ela não há onde criar. */
  google_calendar_id: string | null
  /** Evento já criado antes, para atualizar em vez de duplicar. */
  evento_id: string | null
}

export async function sincronizarEvento(
  dados: DadosDoEvento,
  buscar: typeof fetch = fetch,
): Promise<ResultadoEvento> {
  if (!dados.google_calendar_id) {
    return {
      ok: false,
      motivo:
        'O professor desta turma não tem Agenda do Google no cadastro, então o evento não foi criado.',
    }
  }

  const token = await accessToken(buscar)
  if (!token.ok) return { ok: false, motivo: token.motivo }

  let corpo: ReturnType<typeof montarEvento>
  try {
    corpo = montarEvento(dados)
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'Turma sem data.' }
  }

  const agenda = encodeURIComponent(dados.google_calendar_id)

  // Atualizar quando já existe; criar quando não. `sendUpdates=none` porque o
  // professor já recebe o aviso da turma pelo sistema (G4) — dois e-mails do
  // mesmo assunto na criação seria ruído.
  const url = dados.evento_id
    ? `${API}/${agenda}/events/${encodeURIComponent(dados.evento_id)}?sendUpdates=none`
    : `${API}/${agenda}/events?sendUpdates=none`

  try {
    const resposta = await buscar(url, {
      method: dados.evento_id ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
    })

    // O evento foi apagado na mão no Google: cria de novo em vez de deixar a
    // turma sem evento para sempre.
    if (resposta.status === 404 && dados.evento_id) {
      return sincronizarEvento({ ...dados, evento_id: null }, buscar)
    }

    const json = await resposta.json().catch(() => null)

    if (!resposta.ok) {
      return {
        ok: false,
        motivo:
          json?.error?.message ??
          `O Google recusou a criação do evento (HTTP ${resposta.status}).`,
      }
    }

    if (!json?.id) return { ok: false, motivo: 'O Google respondeu sem o id do evento.' }
    return { ok: true, eventoId: json.id }
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Google Agenda agora.' }
  }
}

/**
 * Troca só a descrição do evento — a lista de alunos muda a cada matrícula.
 *
 * Mandar o evento inteiro, como `sincronizarEvento` faz, levaria junto o
 * início da recorrência (hoje), e o Google apagaria as aulas passadas da
 * agenda do professor a cada aluno matriculado.
 */
export async function atualizarDescricao(
  googleCalendarId: string,
  eventoId: string,
  descricao: string,
  buscar: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; motivo: string; naoExiste?: boolean }> {
  const token = await accessToken(buscar)
  if (!token.ok) return { ok: false, motivo: token.motivo }

  try {
    const resposta = await buscar(
      `${API}/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(eventoId)}?sendUpdates=none`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: descricao }),
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (resposta.ok) return { ok: true }
    // Apagado à mão no Google: quem chamou decide recriar.
    if (resposta.status === 404 || resposta.status === 410) {
      return { ok: false, motivo: 'O evento não existe mais no Google.', naoExiste: true }
    }
    return { ok: false, motivo: `O Google recusou a atualização (HTTP ${resposta.status}).` }
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Google Agenda agora.' }
  }
}

/**
 * As ocorrências de um evento recorrente entre duas datas (AAAA-MM-DD), com a
 * descrição que cada uma tem hoje — herdada da série ou própria.
 *
 * Ocorrência cancelada (apagada à mão no Google) fica de fora: editar a
 * descrição dela a traria de volta.
 */
export async function listarOcorrencias(
  googleCalendarId: string,
  eventoId: string,
  de: string,
  ate: string,
  buscar: typeof fetch = fetch,
): Promise<{ ok: true; ocorrencias: OcorrenciaNoGoogle[] } | { ok: false; motivo: string }> {
  const token = await accessToken(buscar)
  if (!token.ok) return { ok: false, motivo: token.motivo }

  const ocorrencias: OcorrenciaNoGoogle[] = []
  let pagina: string | undefined

  try {
    do {
      const parametros = new URLSearchParams({
        timeMin: `${de}T00:00:00-03:00`,
        timeMax: `${ate}T23:59:59-03:00`,
        // As datas voltam no fuso da escola: a data da ocorrência é a do dia
        // da aula, não a do UTC.
        timeZone: FUSO,
        maxResults: '2500',
      })
      if (pagina) parametros.set('pageToken', pagina)

      const resposta = await buscar(
        `${API}/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(eventoId)}/instances?${parametros}`,
        {
          headers: { Authorization: `Bearer ${token.token}` },
          signal: AbortSignal.timeout(10_000),
        },
      )
      if (!resposta.ok) {
        return { ok: false, motivo: `O Google recusou a leitura das ocorrências (HTTP ${resposta.status}).` }
      }

      const json = (await resposta.json()) as {
        items?: {
          id: string
          status?: string
          description?: string
          originalStartTime?: { dateTime?: string; date?: string }
        }[]
        nextPageToken?: string
      }

      for (const item of json.items ?? []) {
        const inicio = item.originalStartTime?.dateTime ?? item.originalStartTime?.date
        if (item.status === 'cancelled' || !inicio) continue
        ocorrencias.push({ id: item.id, data: inicio.slice(0, 10), descricao: item.description ?? null })
      }

      pagina = json.nextPageToken
    } while (pagina)
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Google Agenda agora.' }
  }

  return { ok: true, ocorrencias }
}

/** Turma encerrada: o evento sai da agenda do professor. */
export async function apagarEvento(
  googleCalendarId: string,
  eventoId: string,
  buscar: typeof fetch = fetch,
): Promise<{ ok: boolean; motivo?: string }> {
  const token = await accessToken(buscar)
  if (!token.ok) return { ok: false, motivo: token.motivo }

  try {
    const resposta = await buscar(
      `${API}/${encodeURIComponent(googleCalendarId)}/events/${encodeURIComponent(eventoId)}?sendUpdates=none`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token.token}` } },
    )

    // 410 = já estava apagado. Para o efeito desejado, é sucesso.
    if (resposta.ok || resposta.status === 410 || resposta.status === 404) return { ok: true }
    return { ok: false, motivo: `O Google recusou a exclusão (HTTP ${resposta.status}).` }
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Google Agenda agora.' }
  }
}
