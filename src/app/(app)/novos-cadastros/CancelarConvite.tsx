'use client'

import { useTransition } from 'react'
import { cancelar } from './acoes'

export function CancelarConvite({ conviteId }: { conviteId: number }) {
  const [pendente, iniciar] = useTransition()
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => iniciar(async () => void (await cancelar(conviteId)))}
      className="min-h-[44px] text-sm font-medium text-tinta-suave underline-offset-4 hover:underline disabled:opacity-45"
    >
      {pendente ? 'Cancelando…' : 'Cancelar link'}
    </button>
  )
}
