'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { desfazerRecebimento } from '../../recebimentos/acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'

/**
 * Cancelar um recebimento lancado errado (pedido do Julio, 09/11/2026). Dois
 * passos — abrir e confirmar com o motivo — porque o registro e apagado: um
 * clique so, perto do valor, seria facil de dar sem querer.
 */
export function CancelarRecebimento({
  recebimentoId,
  valor,
  credito,
}: {
  recebimentoId: number
  valor: number
  /** Abatimento de crédito: o valor volta para o crédito do responsável. */
  credito: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [pendente, iniciar] = useTransition()

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="min-h-[44px] rounded-campo px-3 text-sm font-medium text-erro underline-offset-4 hover:underline"
      >
        Cancelar
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setErros([])
        iniciar(async () => {
          const r = await desfazerRecebimento({ recebimentoId, motivo })
          if (r.ok) router.refresh()
          else setErros(r.erros ?? ['Não foi possível cancelar.'])
        })
      }}
      className="mt-3 flex w-full flex-col gap-3 rounded-campo border border-erro-borda bg-erro-suave/40 p-4"
    >
      <p className="text-sm">
        Cancelar o recebimento de <strong>{formatarBRL(valor)}</strong>? O valor volta a ficar em aberto na
        cobrança.
        {credito && ' Como foi pago com crédito, o valor volta para o crédito do responsável.'}
      </p>
      <Campo etiqueta="Motivo" ajuda="Fica registrado no histórico, junto com quem cancelou." obrigatorio>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: lançado na cobrança errada"
          className={entradaClasse}
          autoFocus
        />
      </Campo>
      {erros.length > 0 && (
        <ul role="alert" className="text-sm text-erro">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-3">
        <Botao type="submit" aparencia="perigo" disabled={pendente || !motivo.trim()}>
          {pendente ? 'Cancelando…' : 'Confirmar cancelamento'}
        </Botao>
        <Botao type="button" aparencia="discreto" onClick={() => setAberto(false)} disabled={pendente}>
          Voltar
        </Botao>
      </div>
    </form>
  )
}
