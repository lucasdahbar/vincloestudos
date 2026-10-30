'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { confirmarConta, descartarRascunho } from '../acoes'

/**
 * Decisao 3 do Julio (28/10/2026): a conta do professor nasce rascunho. Ela
 * nao trava as aulas ate ser confirmada; confirmar confere tudo de novo e, se
 * algo mudou, refaz o rascunho em vez de confirmar o que a gestora nao viu.
 */
export function ConfirmarRascunho({ contaId }: { contaId: number }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      const r = await confirmarConta(contaId)
      if (r.ok) router.refresh()
      else {
        setErro(r.erros.join(' '))
        if (r.novoId) router.replace(`/pagamentos/${r.novoId}`)
      }
    })
  }

  function descartar() {
    setErro(null)
    iniciar(async () => {
      const r = await descartarRascunho(contaId)
      if (r.ok) router.push('/pagamentos')
      else setErro(r.motivo ?? 'Não foi possível descartar.')
    })
  }

  return (
    <Cartao>
      <h2 className="text-lg">Rascunho</h2>
      <p className="mt-1 text-sm text-tinta-suave">
        Confira as aulas abaixo. Enquanto for rascunho, as aulas não ficam travadas: a chamada ainda pode
        ser corrigida. Ao confirmar, o sistema confere tudo de novo e as aulas passam a ficar presas a
        este pagamento.
      </p>
      {erro && (
        <p role="alert" className="mt-3 rounded-campo bg-alerta-suave px-4 py-3 text-sm text-alerta">
          {erro}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Botao type="button" disabled={pendente} onClick={confirmar}>
          {pendente ? 'Conferindo…' : 'Confirmar'}
        </Botao>
        <Botao type="button" aparencia="secundario" disabled={pendente} onClick={descartar}>
          Descartar rascunho
        </Botao>
      </div>
    </Cartao>
  )
}
