import type { ReactNode } from 'react'

interface CampoProps {
  etiqueta: string
  /** Explicacao em linguagem comum. Aparece sempre, nao escondida em tooltip. */
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
        {obrigatorio && (
          <span className="ml-1 text-destaque" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {ajuda && <span className="mb-2 block text-sm text-tinta-suave">{ajuda}</span>}
      {children}
      {erro && (
        <span className="mt-1.5 flex items-start gap-1.5 text-sm text-erro">
          <span aria-hidden="true">•</span>
          {erro}
        </span>
      )}
    </label>
  )
}

/**
 * A borda do campo usa `borda-campo`, que atinge 3:1 contra o branco — o
 * minimo que a WCAG 1.4.11 pede de componente de interface. A borda decorativa,
 * mais clara, ficaria bonita mas deixaria o campo invisivel para quem tem
 * baixa visao.
 */
export const entradaClasse =
  'w-full min-h-[44px] rounded-campo border border-borda-campo bg-superficie ' +
  'px-4 py-2 text-tinta placeholder:text-tinta-tenue ' +
  'transition-colors duration-150 hover:border-tinta-suave ' +
  'focus:border-destaque focus:outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-destaque'
