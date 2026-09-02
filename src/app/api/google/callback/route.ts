import { cookies, headers } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { exigirGestora } from '@/dados/sessao'
import { guardarAutorizacao, trocarCodigoPorToken } from '@/agenda/credenciais'

export const dynamic = 'force-dynamic'

/**
 * Volta do Google com o código da autorização (G2).
 *
 * Troca o código pelo refresh token e o guarda. O token nunca chega ao
 * navegador: a troca acontece aqui, servidor a servidor.
 */
export async function GET(pedido: NextRequest) {
  await exigirGestora()

  const cabecalhos = await headers()
  const anfitriao = cabecalhos.get('host') ?? ''
  const protocolo = anfitriao.startsWith('localhost') ? 'http' : 'https'
  const destino = (params: string) =>
    NextResponse.redirect(`${protocolo}://${anfitriao}/cadastros/integracoes?${params}`)

  const parametros = pedido.nextUrl.searchParams
  const jar = await cookies()
  const esperado = jar.get('google_oauth_estado')?.value
  jar.delete('google_oauth_estado')

  if (parametros.get('error')) return destino('erro=recusado')

  const estado = parametros.get('state')
  if (!esperado || estado !== esperado) return destino('erro=estado')

  const codigo = parametros.get('code')
  if (!codigo) return destino('erro=sem-codigo')

  const redirectUri = `${protocolo}://${anfitriao}/api/google/callback`
  const troca = await trocarCodigoPorToken(codigo, redirectUri)

  if (!troca.ok) return destino(`erro=troca&motivo=${encodeURIComponent(troca.motivo)}`)

  await guardarAutorizacao(troca.refreshToken, await emailDaConta(troca.accessToken))
  return destino('conectado=1')
}

/** Qual conta autorizou, para a tela poder mostrar. Falhar aqui não é grave. */
async function emailDaConta(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) return null
    return (await r.json())?.email ?? null
  } catch {
    return null
  }
}
