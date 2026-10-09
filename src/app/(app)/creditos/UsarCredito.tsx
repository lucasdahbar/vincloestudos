'use client'

import { useState, useTransition } from 'react'
import { abater, devolver } from './acoes'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'

/**
 * As três saídas do crédito (decisão da gestora, 09/10/2026): abater de uma
 * cobrança em aberto, abater da próxima — que é a mesma coisa, assim que ela
 * for gerada — ou devolver o dinheiro. Pode ser em partes.
 */
export function UsarCredito({
  creditoId,
  saldo,
  cobrancas,
  contas,
}: {
  creditoId: number
  saldo: number
  cobrancas: { id: number; mes_referencia: string; saldo: number }[]
  contas: { id: number; nome: string }[]
}) {
  const [modo, setModo] = useState<'abater' | 'devolver' | null>(null)
  const [cobrancaId, setCobrancaId] = useState(cobrancas[0]?.id ?? 0)
  const [conta, setConta] = useState('')
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const emReais = (c: number) => (c / 100).toFixed(2).replace('.', ',')

  // Sugere o máximo que cabe: o menor entre o crédito e o que a cobrança deve.
  const sugerido = (id: number) =>
    emReais(Math.min(saldo, cobrancas.find((c) => c.id === id)?.saldo ?? saldo))
  const [valor, setValor] = useState(sugerido(cobrancaId))

  function executar(fn: () => Promise<{ ok: boolean; erros?: string[] }>) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if (r.ok) setModo(null)
      else setErro(r.erros?.join(' ') ?? 'Não foi possível concluir.')
    })
  }

  if (modo === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Botao
          type="button"
          disabled={cobrancas.length === 0}
          title={cobrancas.length === 0 ? 'Este responsável não tem cobrança em aberto.' : undefined}
          onClick={() => {
            setValor(sugerido(cobrancaId))
            setModo('abater')
          }}
        >
          Abater de uma cobrança
        </Botao>
        <Botao
          type="button"
          aparencia="secundario"
          onClick={() => {
            setValor(emReais(saldo))
            setModo('devolver')
          }}
        >
          Devolver
        </Botao>
        {cobrancas.length === 0 && (
          <p className="w-full text-sm text-tinta-suave">
            Sem cobrança em aberto agora. O crédito fica guardado e pode ser abatido da próxima,
            quando ela for gerada.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {modo === 'abater' ? (
          <label className="flex flex-col gap-1 text-sm">
            Cobrança
            <select
              value={cobrancaId}
              onChange={(e) => {
                setCobrancaId(Number(e.target.value))
                setValor(sugerido(Number(e.target.value)))
              }}
              className={`${entradaClasse} max-w-xs`}
            >
              {cobrancas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.mes_referencia.slice(5, 7)}/{c.mes_referencia.slice(0, 4)} · deve{' '}
                  {formatarBRL(c.saldo)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-sm">
            Saiu da conta (opcional)
            <select
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              className={`${entradaClasse} max-w-xs`}
            >
              <option value="">Não informar</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Valor (R$)
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={`${entradaClasse} w-32`}
          />
        </label>
      </div>

      {modo === 'devolver' && (
        <input
          type="text"
          placeholder="Observação (opcional): como foi devolvido"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className={entradaClasse}
        />
      )}

      <div className="flex gap-2">
        <Botao
          type="button"
          disabled={pendente}
          onClick={() =>
            executar(() =>
              modo === 'abater'
                ? abater(creditoId, cobrancaId, valor)
                : devolver(creditoId, valor, conta ? Number(conta) : null, observacao),
            )
          }
        >
          {pendente ? 'Registrando…' : modo === 'abater' ? 'Abater' : 'Registrar devolução'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => setModo(null)}>
          Cancelar
        </Botao>
      </div>

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-3 py-2 text-sm text-erro">
          {erro}
        </p>
      )}
    </div>
  )
}
