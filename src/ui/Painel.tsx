'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'

/**
 * Painel lateral por cima da tela (etapa 5, 28/10/2026): a agenda continua
 * atras, no mesmo lugar, e fechar volta para ela. A URL e a da pagina inteira,
 * entao copiar o link ou recarregar abre a pagina normal.
 *
 * Fecha com o X, com Esc ou clicando fora, sempre pelo historico: o "voltar"
 * do navegador faz a mesma coisa.
 */
export function Painel({
  titulo,
  href,
  children,
}: {
  titulo: string
  /** A pagina inteira do que o painel mostra. */
  href: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') router.back()
    }
    document.addEventListener('keydown', fechar)
    // A agenda atras nao rola junto com o painel.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    caixa.current?.focus()
    return () => {
      document.removeEventListener('keydown', fechar)
      document.body.style.overflow = antes
    }
  }, [router])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.button
        type="button"
        aria-label="Fechar"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => router.back()}
        className="absolute inset-0 bg-tinta/30"
      />
      <motion.div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative flex h-full w-full max-w-2xl flex-col bg-fundo shadow-cartao outline-none"
      >
        <div className="flex items-center justify-between gap-3 border-b border-borda bg-superficie px-4 py-2">
          {/* <a>, e nao <Link>: o Link seria interceptado de novo e abriria o painel. */}
          <a href={href} className="text-sm text-destaque hover:underline">
            Abrir a página inteira
          </a>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Fechar"
            className="min-h-[44px] min-w-[44px] rounded-campo text-2xl leading-none text-tinta-suave hover:bg-superficie-2"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
      </motion.div>
    </div>
  )
}
