'use client'

import { useRef, useState } from 'react'
import { formatarBRL } from '@/dominio/dinheiro'
import type { LinhaDoResumo } from '@/dominio/cobrancas/troca-de-servico'
import { previaDaDiferenca } from './acoes'

type Pedido = { escopo: 'esta'; aulaId: number } | { escopo: 'a-partir' | 'serie'; aPartirDe: string }

type Estado =
  | { tipo: 'nada' }
  | { tipo: 'carregando' }
  | { tipo: 'pronto'; familias: LinhaDoResumo[] }
  | { tipo: 'erro'; motivo: string }

/**
 * Troca de servico em aula ja cobrada (Julio, 24/11/2026): "o sistema pergunta
 * se e para gerar credito" — e se e para cobrar a diferenca. A previa vem do
 * servidor, pela mesma regra da gravacao. Pergunta pedida ao trocar o
 * servico no select (sem efeito), e a resposta mais nova e a que vale.
 */
export function usePreviaDaDiferenca(turmaId: number, pedido: Pedido) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'nada' })
  const [aplicar, setAplicar] = useState(true)
  const vez = useRef(0)

  function consultar(servicoNovo: number, servicoDeHoje: number) {
    const minha = ++vez.current
    setAplicar(true)
    if (servicoNovo === servicoDeHoje) {
      setEstado({ tipo: 'nada' })
      return
    }
    setEstado({ tipo: 'carregando' })
    previaDaDiferenca(turmaId, pedido, servicoNovo)
      .then((r) => {
        if (minha !== vez.current) return
        setEstado(r.ok ? { tipo: 'pronto', familias: r.familias } : { tipo: 'erro', motivo: r.erros[0] ?? 'Falha ao calcular.' })
      })
      .catch(() => {
        if (minha === vez.current) setEstado({ tipo: 'erro', motivo: 'Não foi possível calcular a diferença agora.' })
      })
  }

  return { estado, aplicar, setAplicar, consultar }
}

export function DiferencaDaTroca({
  estado,
  aplicar,
  setAplicar,
}: {
  estado: Estado
  aplicar: boolean
  setAplicar: (v: boolean) => void
}) {
  if (estado.tipo === 'nada') return null
  if (estado.tipo === 'carregando') {
    return <p className="mt-3 text-sm text-tinta-suave">Conferindo as cobranças das aulas…</p>
  }
  if (estado.tipo === 'erro') {
    return <p className="mt-3 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">{estado.motivo}</p>
  }
  if (estado.familias.length === 0) return null

  const aMais = estado.familias.some((f) => f.complementar > 0)
  const aMenos = estado.familias.some((f) => f.credito > 0)
  const pergunta =
    aMais && aMenos ? 'Cobrar a diferença e gerar o crédito' : aMais ? 'Cobrar a diferença' : 'Gerar o crédito da diferença'

  return (
    <div className="mt-4 rounded-campo bg-alerta-suave px-4 py-3 text-sm">
      <p className="font-medium">Estas aulas já foram cobradas e mudam de preço:</p>
      <ul className="mt-2 flex flex-col gap-1">
        {estado.familias.map((f) => (
          <li key={f.responsavel_id}>
            <span className="font-medium">{f.responsavel_nome}</span>
            {f.complementar > 0 && <> · {formatarBRL(f.complementar)} a mais, numa cobrança complementar</>}
            {f.credito > 0 && <> · {formatarBRL(f.credito)} a menos, como crédito</>}
            {f.ajustadas > 0 && (
              <>
                {' '}
                · {f.ajustadas === 1 ? '1 aula corrigida' : `${f.ajustadas} aulas corrigidas`} na própria cobrança (ainda sem
                pagamento)
              </>
            )}
          </li>
        ))}
      </ul>
      {(aMais || aMenos) && (
        <label className="mt-3 flex items-start gap-2">
          <input type="checkbox" checked={aplicar} onChange={(e) => setAplicar(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-medium">{pergunta}</span>
            {!aplicar && (
              <span className="block text-tinta-suave">
                A diferença das aulas já pagas fica registrada como dispensada, sem cobrança nem crédito.
              </span>
            )}
          </span>
        </label>
      )}
    </div>
  )
}
