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
