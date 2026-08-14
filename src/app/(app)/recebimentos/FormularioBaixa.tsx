'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { darBaixa } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'

const FORMAS = ['Pix', 'Dinheiro', 'Transferência', 'Cartão', 'Outros']

export function FormularioBaixa({
  cobrancaId,
  responsavel,
  saldo,
  contas,
}: {
  cobrancaId: number
  responsavel: string
  saldo: number
  contas: { id: number; nome: string }[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])
  // Pre-preenchido com o saldo, editavel para pagamento parcial (Operacionais 7.4).
  const [valor, setValor] = useState((saldo / 100).toFixed(2).replace('.', ','))
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [contaId, setContaId] = useState<number | null>(contas[0]?.id ?? null)
  const [forma, setForma] = useState('Pix')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setErros([])
        iniciar(async () => {
          const r = await darBaixa({
            cobrancaId,
            valorTexto: valor,
            data,
            contaId,
            formaPagamento: forma,
            observacao: null,
          })
          if (r.ok) router.refresh()
          else setErros(r.erros ?? ['Não foi possível registrar.'])
        })
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-tinta-suave">
        {responsavel} · saldo em aberto de <strong>{formatarBRL(saldo)}</strong>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Valor recebido" ajuda="Pode ser menor que o saldo, para pagamento parcial." obrigatorio>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={entradaClasse} />
        </Campo>
        <Campo etiqueta="Data" obrigatorio>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={entradaClasse} />
        </Campo>
        <Campo etiqueta="Conta de destino" obrigatorio>
          <select
            value={contaId ?? ''}
            onChange={(e) => setContaId(e.target.value ? Number(e.target.value) : null)}
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Forma de pagamento">
          <select value={forma} onChange={(e) => setForma(e.target.value)} className={entradaClasse}>
            {FORMAS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Campo>
      </div>

      {erros.length > 0 && (
        <ul role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <Botao type="submit" disabled={pendente}>
        {pendente ? 'Registrando…' : 'Registrar recebimento'}
      </Botao>
    </form>
  )
}
