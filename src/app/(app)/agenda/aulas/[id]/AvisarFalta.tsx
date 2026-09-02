'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { registrarFaltaAvisada } from '../../../reposicoes/acoes'

/**
 * R2 (Rodada 2): a gestora registra que o aluno avisou que nao vem.
 *
 * Fica ao lado do nome, na propria lista da aula, porque e ali que ela esta
 * olhando quando o responsavel manda a mensagem. Ao confirmar, o aluno sai da
 * lista desta aula (R3) e passa a viver em Reposicoes.
 */
export function AvisarFalta({
  alunoId,
  aulaId,
  nome,
}: {
  alunoId: number
  aulaId: number
  nome: string
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  if (erro) {
    return <span className="text-sm text-erro">{erro}</span>
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="min-h-[44px] shrink-0 text-sm font-medium text-tinta-suave underline-offset-4 hover:text-destaque hover:underline"
      >
        Avisou que não vem
      </button>
    )
  }

  return (
    <span className="flex shrink-0 items-center gap-3 text-sm">
      <span className="text-tinta-suave">Gerar reposição para {nome.split(' ')[0]}?</span>
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await registrarFaltaAvisada(alunoId, aulaId)
            if (r.ok) router.refresh()
            else setErro(r.erros?.[0] ?? 'Não foi possível registrar.')
          })
        }
        className="min-h-[44px] font-medium text-destaque underline-offset-4 hover:underline"
      >
        {pendente ? 'Registrando…' : 'Sim'}
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
