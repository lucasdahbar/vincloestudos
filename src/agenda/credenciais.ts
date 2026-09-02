import 'server-only'
import { clienteAdmin } from '@/dados/admin'

/**
 * Autorização OAuth da conta Google da empresa (G2).
 *
 * O refresh token é o segredo que permite escrever nas agendas dos
 * professores. Ele vive numa tabela sem policy nenhuma — nem a gestora lê pelo
 * cliente do navegador —, e só é alcançado daqui, pelo servidor.
 *
 * Ver `docs/google-agenda.md` para o roteiro de configuração.
 */

export const ESCOPO = 'https://www.googleapis.com/auth/calendar'

export interface Credenciais {
  clientId: string
  clientSecret: string
}

/** `null` quando o Cloud Console ainda não foi configurado. */
export function credenciaisDoApp(): Credenciais | null {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/** A URL para onde a gestora é mandada para clicar em "Permitir". */
export function urlDeAutorizacao(redirectUri: string, estado: string): string | null {
  const cred = credenciaisDoApp()
  if (!cred) return null

  const parametros = new URLSearchParams({
    client_id: cred.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPO,
    // `offline` é o que faz o Google devolver refresh token; `consent` força a
    // tela mesmo se ela já tiver autorizado antes — sem isso, uma reconexão
    // volta sem refresh token e a integração fica quebrada de um jeito difícil
    // de diagnosticar.
    access_type: 'offline',
    prompt: 'consent',
    state: estado,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${parametros}`
}

export interface Autorizacao {
  email: string | null
  conectado_em: string
}

/** Quem está conectado, sem devolver o segredo. */
export async function autorizacaoAtual(): Promise<Autorizacao | null> {
  const { data } = await clienteAdmin()
    .from('google_oauth')
    .select('email, conectado_em')
    .eq('id', 1)
    .maybeSingle()

  return data ?? null
}

export async function guardarAutorizacao(
  refreshToken: string,
  email: string | null,
): Promise<void> {
  const { error } = await clienteAdmin()
    .from('google_oauth')
    .upsert(
      {
        id: 1,
        refresh_token: refreshToken,
        email,
        escopo: ESCOPO,
        conectado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

  if (error) throw new Error(`Falha ao guardar a autorização: ${error.message}`)
}

export async function desconectar(): Promise<void> {
  await clienteAdmin().from('google_oauth').delete().eq('id', 1)
}

/**
 * Troca o código da autorização por um refresh token.
 *
 * `buscar` é injetável para o teste não depender da rede, no mesmo padrão do
 * ViaCEP e da BrasilAPI.
 */
export async function trocarCodigoPorToken(
  codigo: string,
  redirectUri: string,
  buscar: typeof fetch = fetch,
): Promise<{ ok: true; refreshToken: string; accessToken: string } | { ok: false; motivo: string }> {
  const cred = credenciaisDoApp()
  if (!cred) return { ok: false, motivo: 'As credenciais do Google não estão configuradas.' }

  try {
    const resposta = await buscar('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: codigo,
        client_id: cred.clientId,
        client_secret: cred.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const corpo = await resposta.json()
    if (!resposta.ok) {
      return { ok: false, motivo: corpo?.error_description ?? 'O Google recusou a autorização.' }
    }
    if (!corpo.refresh_token) {
      // Acontece quando a conta já autorizou antes e o pedido veio sem
      // `prompt=consent`. Sem refresh token a integração só duraria uma hora.
      return {
        ok: false,
        motivo:
          'O Google não devolveu a autorização de longo prazo. Remova o acesso do ' +
          'Mesinha Redonda em myaccount.google.com/permissions e conecte de novo.',
      }
    }

    return { ok: true, refreshToken: corpo.refresh_token, accessToken: corpo.access_token }
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Google agora.' }
  }
}

/**
 * Um access token válido, a partir do refresh guardado.
 *
 * Não é guardado em cache de propósito: ele vale uma hora, e um cache em
 * processo daria comportamento diferente em cada instância do servidor.
 */
export async function accessToken(
  buscar: typeof fetch = fetch,
): Promise<{ ok: true; token: string } | { ok: false; motivo: string }> {
  const cred = credenciaisDoApp()
  if (!cred) return { ok: false, motivo: 'As credenciais do Google não estão configuradas.' }

  const { data } = await clienteAdmin()
    .from('google_oauth')
    .select('refresh_token')
    .eq('id', 1)
    .maybeSingle()

  if (!data?.refresh_token) {
    return { ok: false, motivo: 'O Google Agenda ainda não foi conectado.' }
  }

  try {
    const resposta = await buscar('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: data.refresh_token,
        client_id: cred.clientId,
        client_secret: cred.clientSecret,
        grant_type: 'refresh_token',
      }),
    })

    const corpo = await resposta.json()
    if (!resposta.ok || !corpo.access_token) {
      return {
        ok: false,
        motivo:
          corpo?.error === 'invalid_grant'
            ? 'A autorização do Google expirou ou foi revogada. Conecte de novo em Integrações.'
            : 'Não foi possível renovar o acesso ao Google Agenda.',
      }
    }

    return { ok: true, token: corpo.access_token }
  } catch {
    return { ok: false, motivo: 'Não foi possível falar com o Google agora.' }
  }
}
