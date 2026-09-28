import 'server-only'
import { accessToken } from './credenciais'
import {
  ajustesDeCoorganizador,
  CONFIGURACAO_DA_SALA,
  type MembroDaSala,
} from '@/dominio/agenda/meet'

/**
 * G3 (Rodada 2): cria a sala do Meet da turma online e mantém o professor
 * como coorganizador. A decisão de quando fazer isso está em
 * `dominio/agenda/meet.ts`.
 *
 * A sala pertence à conta que autorizou a integração, e essa conta precisa de
 * um plano com coorganizador (Business Standard ou acima).
 *
 * Como em `eventos.ts`, nada aqui estoura: a turma já está salva, e a sala é
 * reflexo dela.
 */

const API = 'https://meet.googleapis.com/v2'

type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string }

/** O pedaço das respostas da API do Meet que o sistema lê. */
interface RespostaMeet {
  name?: string
  meetingUri?: string
  members?: MembroDaSala[]
  error?: { message?: string }
}

async function chamar(
  token: string,
  caminho: string,
  init: { method: 'GET' | 'POST' | 'DELETE'; corpo?: unknown },
  buscar: typeof fetch,
): Promise<{ ok: true; json: RespostaMeet | null } | { ok: false; motivo: string }> {
  try {
    const resposta = await buscar(`${API}/${caminho}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.corpo ? JSON.stringify(init.corpo) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const json: RespostaMeet | null = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      return {
        ok: false,
        motivo:
          resposta.status === 403 && /scope/i.test(json?.error?.message ?? '')
            ? 'A integração com o Google precisa ser reconectada para criar salas do Meet.'
            : (json?.error?.message ?? `O Google Meet recusou o pedido (HTTP ${resposta.status}).`),
      }
    }
    return { ok: true, json }
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Google Meet agora.' }
  }
}

/** Cria a sala e já põe o professor como coorganizador. */
export async function criarSala(
  emailProfessor: string | null,
  buscar: typeof fetch = fetch,
): Promise<Resultado<{ sala: string; link: string; motivoCoorganizador?: string }>> {
  const token = await accessToken(buscar)
  if (!token.ok) return token

  const criada = await chamar(token.token, 'spaces', { method: 'POST', corpo: CONFIGURACAO_DA_SALA }, buscar)
  if (!criada.ok) return criada

  const sala = criada.json?.name
  const link = criada.json?.meetingUri
  if (!sala || !link) return { ok: false, motivo: 'O Google Meet respondeu sem o link da sala.' }

  // A sala vale mesmo se o coorganizador falhar: o link já serve, e a próxima
  // vez que a turma for salva tenta de novo. Por isso o motivo volta à parte.
  const coorg = await ajustarCoorganizador(sala, emailProfessor, buscar)
  return { ok: true, sala, link, motivoCoorganizador: coorg.ok ? undefined : coorg.motivo }
}

/** Deixa o professor atual, e só ele, como coorganizador da sala. */
export async function ajustarCoorganizador(
  sala: string,
  emailProfessor: string | null,
  buscar: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const token = await accessToken(buscar)
  if (!token.ok) return token

  const lista = await chamar(token.token, `${sala}/members`, { method: 'GET' }, buscar)
  if (!lista.ok) return lista

  const membros = lista.json?.members ?? []
  const { adicionar, remover } = ajustesDeCoorganizador(membros, emailProfessor)

  for (const membro of remover) {
    const r = await chamar(token.token, membro, { method: 'DELETE' }, buscar)
    if (!r.ok) return r
  }

  if (adicionar) {
    const r = await chamar(
      token.token,
      `${sala}/members`,
      { method: 'POST', corpo: { email: adicionar, role: 'COHOST' } },
      buscar,
    )
    if (!r.ok) return r
  }

  return { ok: true }
}
