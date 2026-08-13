'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { entradaClasse } from './Campo'

export function Busca({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const parametros = useSearchParams()
  const [termo, setTermo] = useState(parametros.get('busca') ?? '')

  useEffect(() => {
    const timer = setTimeout(() => {
      const novos = new URLSearchParams(parametros.toString())
      if (termo) novos.set('busca', termo)
      else novos.delete('busca')
      router.replace(`?${novos.toString()}`)
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo])

  return (
    <input
      type="search"
      value={termo}
      onChange={(e) => setTermo(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`${entradaClasse} max-w-sm`}
    />
  )
}
