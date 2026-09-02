import { randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { exigirGestora } from '@/dados/sessao'
import { urlDeAutorizacao } from '@/agenda/credenciais'

export const dynamic = 'force-dynamic'

/**
 * Começa a autorização do Google Agenda (G2).
 *
 * Só a gestora: quem passar por aqui está prestes a dar acesso de escrita às
 * agendas da empresa.
 */
export async function GET() {
  await exigirGestora()

  const cabecalhos = await headers()
  const anfitriao = cabecalhos.get('host') ?? ''
  const protocolo = anfitriao.startsWith('localhost') ? 'http' : 'https'
  const redirectUri = `${protocolo}://${anfitriao}/api/google/callback`

  // `state` contra CSRF: sem ele, um link forjado poderia fazer a gestora
  // conectar uma conta que não é dela sem perceber.
  const estado = randomBytes(16).toString('hex')
  const url = urlDeAutorizacao(redirectUri, estado)

  if (!url) {
    return NextResponse.redirect(
      `${protocolo}://${anfitriao}/cadastros/integracoes?erro=sem-credenciais`,
    )
  }

  const jar = await cookies()
  jar.set('google_oauth_estado', estado, {
    httpOnly: true,
    secure: protocolo === 'https',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return NextResponse.redirect(url)
}
