import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

type Aparencia = 'primario' | 'secundario' | 'discreto' | 'perigo'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-campo ' +
  'px-5 min-h-[44px] font-medium transition-all duration-150 ' +
  'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none'

const APARENCIAS: Record<Aparencia, string> = {
  primario: 'bg-destaque text-white hover:bg-destaque-forte shadow-sm',
  secundario: 'bg-superficie text-tinta border border-borda hover:bg-superficie-2',
  discreto: 'text-tinta-suave hover:text-tinta hover:bg-superficie-2',
  perigo: 'bg-erro-suave text-erro border border-erro/20 hover:bg-erro hover:text-white',
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
