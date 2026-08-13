'use client'

import { useState, useTransition } from 'react'
import { agendar, desistir } from './acoes'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'

interface OpcaoAula {
  id: number
  rotulo: string
}

export function AcoesPendencia({
  pendenciaId,
  aulas,
}: {
  pendenciaId: number
  aulas: OpcaoAula[]
}) {
  const [destino, setDestino] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function executar(fn: () => Promise<{ ok: boolean; erros?: string[] }>) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      if (!r.ok) setErro(r.erros?.join(' ') ?? 'Não foi possível concluir.')
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          aria-label="Aula de destino da reposição"
          className={`${entradaClasse} max-w-xs`}
        >
          <option value="">Escolha a aula da reposição…</option>
          {aulas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.rotulo}
            </option>
          ))}
        </select>

        <Botao
          type="button"
          disabled={pendente || destino === ''}
          onClick={() => executar(() => agendar(pendenciaId, Number(destino)))}
        >
          Agendar
        </Botao>

        <Botao
          type="button"
          aparencia="secundario"
          disabled={pendente}
          onClick={() => executar(() => desistir(pendenciaId))}
        >
          Desistiu
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
