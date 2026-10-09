'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { estenderTurmas } from './acoes'
import { Botao } from '@/ui/Botao'

/**
 * Rodada 4: turma sem fim escolhido vai até 31/12. Em dezembro a gestora
 * estende — de preferência depois de cadastrar os feriados do ano novo, para
 * eles já saírem da agenda.
 */
export function RenovarTurmas({ ids, ano, fim }: { ids: number[]; ano: string; fim: string }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-campo bg-superficie-2 px-4 py-3">
      <p>
        {ids.length} {ids.length === 1 ? 'turma termina' : 'turmas terminam'} em {fim}. Cadastre os
        feriados de {ano} e estenda:
      </p>
      <Botao
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null)
            const r = await estenderTurmas(ids)
            if (r.ok) router.refresh()
            else setErro(r.erro ?? 'Não foi possível estender.')
          })
        }
      >
        {pendente ? 'Estendendo…' : `Estender até dez/${ano}`}
      </Botao>
      {erro && <p role="alert" className="w-full text-sm text-erro">{erro}</p>}
    </div>
  )
}
