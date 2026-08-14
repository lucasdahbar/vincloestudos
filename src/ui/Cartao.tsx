import type { ReactNode } from 'react'

export function Cartao({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-cartao border border-borda bg-superficie p-6 shadow-cartao ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Cartao que e um link. Sobe um fio ao passar o mouse — o movimento e o que
 * comunica "isto abre", nao a mudanca de cor sozinha.
 */
export function CartaoInterativo({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`h-full rounded-cartao border border-borda bg-superficie p-5 shadow-sutil transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-destaque/30 hover:shadow-cartao ${className}`}
    >
      {children}
    </div>
  )
}
