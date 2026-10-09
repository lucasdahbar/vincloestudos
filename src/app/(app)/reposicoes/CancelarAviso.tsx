'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { desfazerAviso } from './acoes'

/**
 * Aviso registrado por engano, ou o aluno acabou vindo. O servidor confere se
 * ainda dá: depois de reposição marcada, crédito gerado ou pagamento ao
 * professor, o acerto é pelo caminho normal.
 */
export function CancelarAviso({ pendenciaId, nome }: { pendenciaId: number; nome: string }) {
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
        Cancelar aviso
      </button>
    )
  }

  return (
    <span className="flex items-center gap-3 text-sm">
      <span className="text-tinta-suave">{nome.split(' ')[0]} vem à aula?</span>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await desfazerAviso(pendenciaId)
            if (r.ok) router.refresh()
            else setErro(r.erros?.[0] ?? 'Não foi possível cancelar.')
          })
        }
        className="min-h-[44px] font-medium text-destaque underline-offset-4 hover:underline"
      >
        {pendente ? 'Cancelando…' : 'Sim, cancelar o aviso'}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="min-h-[44px] text-tinta-suave underline-offset-4 hover:underline"
      >
        Não
      </button>
    </span>
  )
}
