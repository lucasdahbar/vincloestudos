import type { ReactNode } from 'react'

interface CampoProps {
  etiqueta: string
  /** Explicacao em linguagem comum. Aparece sempre, nao em tooltip escondido. */
  ajuda?: string
  erro?: string
  obrigatorio?: boolean
  children: ReactNode
}

export function Campo({ etiqueta, ajuda, erro, obrigatorio, children }: CampoProps) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium text-tinta">
        {etiqueta}
        {obrigatorio && <span className="ml-1 text-destaque">*</span>}
      </span>
      {ajuda && <span className="mb-2 block text-sm text-tinta-suave">{ajuda}</span>}
      {children}
      {erro && <span className="mt-1 block text-sm text-erro">{erro}</span>}
    </label>
  )
}

export const entradaClasse =
  'w-full min-h-[44px] rounded-campo border border-borda bg-superficie ' +
  'px-4 py-2 text-tinta placeholder:text-tinta-suave/60 ' +
  'transition-colors focus:border-destaque focus:outline-none ' +
  'focus-visible:outline-3 focus-visible:outline-destaque'
