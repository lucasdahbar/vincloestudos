'use client'

import { useState } from 'react'
import type { Decisao } from '@/dominio/reposicoes/desfecho'

/**
 * As duas perguntas da regra de 09/10/2026 quando a reposição não vai
 * acontecer: cobrar a aula perdida? E, cobrando, considerar no pagamento do
 * professor ("desistência paga")?
 *
 * Usada no aviso ("não gerar reposição") e na desistência, que terminam na
 * mesma decisão.
 */
export function PerguntasDeCobranca({
  pendente,
  onDecidir,
  onVoltar,
}: {
  pendente: boolean
  onDecidir: (decisao: Decisao) => void
  onVoltar: () => void
}) {
  const [cobrar, setCobrar] = useState<boolean | null>(null)

  const opcao =
    'min-h-[44px] font-medium text-destaque underline-offset-4 hover:underline disabled:opacity-50'
  const voltar = 'min-h-[44px] text-tinta-suave underline-offset-4 hover:underline'

  if (pendente) return <span className="text-sm text-tinta-suave">Registrando…</span>

  if (cobrar === null) {
    return (
      <span className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-tinta-suave">Cobrar esta aula?</span>
        <button type="button" className={opcao} onClick={() => setCobrar(true)}>
          Sim, cobrar
        </button>
        <button
          type="button"
          className={opcao}
          title="Se a aula já foi cobrada, o valor vira crédito do responsável."
          onClick={() => onDecidir({ cobrar: false, pagarProfessor: false })}
        >
          Não cobrar
        </button>
        <button type="button" className={voltar} onClick={onVoltar}>
          Voltar
        </button>
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-tinta-suave">Pagar o professor por esta aula?</span>
      <button
        type="button"
        className={opcao}
        onClick={() => onDecidir({ cobrar: true, pagarProfessor: true })}
      >
        Sim (desistência paga)
      </button>
      <button
        type="button"
        className={opcao}
        onClick={() => onDecidir({ cobrar: true, pagarProfessor: false })}
      >
        Não
      </button>
      <button type="button" className={voltar} onClick={() => setCobrar(null)}>
        Voltar
      </button>
    </span>
  )
}
