'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { marcarQueVeioMesmoAssim } from './acoes'

/**
 * Caso Francisco (24/11/2026): avisou, já repôs e apareceu na aula mesmo
 * assim. Regra do Julio: é como uma nova matrícula — esta aula conta (cobrada e
 * paga ao professor) e a reposição vira aula avulsa, cobrada à parte.
 */
export function VeioMesmoAssim({ pendenciaId, nome }: { pendenciaId: number; nome: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  if (erro) return <span className="text-sm text-erro">{erro}</span>

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="min-h-[44px] text-sm text-tinta-suave underline-offset-4 hover:text-destaque hover:underline"
      >
        Veio mesmo assim
      </button>
    )
  }

  return (
    <span className="flex max-w-md flex-col gap-2 text-sm">
      <span className="text-tinta-suave">
        {nome.split(' ')[0]} já fez a reposição desta aula. Se ele vier, esta aula volta para a chamada
        (o professor recebe) e a reposição passa a ser cobrada como aula avulsa.
      </span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await marcarQueVeioMesmoAssim(pendenciaId)
              if (r.ok) {
                if (r.avisos?.length) window.alert(r.avisos.join('\n'))
                router.refresh()
              } else setErro(r.erros?.[0] ?? 'Não foi possível registrar.')
            })
          }
          className="min-h-[44px] font-medium text-destaque underline-offset-4 hover:underline"
        >
          {pendente ? 'Registrando…' : 'Sim, ele veio'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="min-h-[44px] text-tinta-suave underline-offset-4 hover:underline"
        >
          Não
        </button>
      </span>
    </span>
  )
}
