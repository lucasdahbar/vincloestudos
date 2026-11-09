'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { criarSalaDaAula } from '../../acoes'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'

/**
 * Bug de 09/11/2026: aula online de turma presencial sem sala do Meet. A
 * edicao ja tenta criar; isto e o "tente de novo" quando o Google falhou.
 */
export function CriarSalaDaAula({ aulaId }: { aulaId: number }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function criar() {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await criarSalaDaAula(aulaId)
        if (r.ok) router.refresh()
        else setErro(r.motivo)
      } catch {
        setErro('Não foi possível criar a sala agora. Tente de novo.')
      }
    })
  }

  return (
    <Cartao>
      <h2 className="text-lg">Aula online sem link</h2>
      <p className="mt-1 text-sm text-tinta-suave">
        A turma é presencial, mas esta aula é online e ainda não tem sala do Meet.
      </p>
      {erro && <p className="mt-3 rounded-lg bg-alerta-suave px-3 py-2 text-sm">{erro}</p>}
      <div className="mt-3">
        <Botao type="button" onClick={criar} disabled={pendente}>
          {pendente ? 'Criando…' : 'Criar sala do Meet'}
        </Botao>
      </div>
    </Cartao>
  )
}
