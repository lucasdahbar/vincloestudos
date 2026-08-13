import type { Metadata } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'

const texto = Inter({
  subsets: ['latin'],
  variable: '--fonte-texto',
  display: 'swap',
})

const titulo = Fraunces({
  subsets: ['latin'],
  variable: '--fonte-titulo',
  weight: ['500', '600'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mesinha Redonda',
  description: 'Gestão de reforço escolar e aulas particulares',
}

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${texto.variable} ${titulo.variable}`}>
      <body className="min-h-dvh bg-fundo text-tinta antialiased">{children}</body>
    </html>
  )
}
