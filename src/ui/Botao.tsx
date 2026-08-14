import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

type Aparencia = 'primario' | 'secundario' | 'discreto' | 'perigo'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-campo px-5 min-h-[44px] ' +
  'font-medium tracking-[-0.005em] transition-all duration-150 ease-out ' +
  'active:scale-[0.985] disabled:opacity-45 disabled:pointer-events-none ' +
  'disabled:shadow-none'

const APARENCIAS: Record<Aparencia, string> = {
  // O primario e o unico elemento com sombra colorida: guia o olho para a
  // acao principal sem precisar de tamanho ou cor extra.
  primario:
    'bg-destaque text-white shadow-destaque hover:bg-destaque-forte ' +
    'hover:shadow-elevado hover:-translate-y-px',
  secundario:
    'bg-superficie text-tinta border border-borda shadow-sutil ' +
    'hover:border-destaque/35 hover:text-destaque-forte hover:-translate-y-px',
  discreto: 'text-tinta-suave hover:text-tinta hover:bg-superficie-2',
  perigo:
    'bg-erro-suave text-erro border border-erro-borda ' +
    'hover:bg-erro hover:text-white hover:border-erro',
}

interface Comum {
  aparencia?: Aparencia
  children: ReactNode
}

export function Botao({
  aparencia = 'primario',
  className = '',
  ...props
}: Comum & ComponentProps<'button'>) {
  return <button className={`${BASE} ${APARENCIAS[aparencia]} ${className}`} {...props} />
}

export function BotaoLink({
  aparencia = 'primario',
  className = '',
  ...props
}: Comum & ComponentProps<typeof Link>) {
  return <Link className={`${BASE} ${APARENCIAS[aparencia]} ${className}`} {...props} />
}
