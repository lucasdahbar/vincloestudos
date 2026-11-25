'use client'

import { useState, useTransition } from 'react'
import { agendar, desistir } from './acoes'
import { PerguntasDeCobranca } from './PerguntasDeCobranca'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'
import { diferencaDaReposicao } from '@/dominio/reposicoes/credito-da-diferenca'

interface OpcaoAula {
  id: number
  rotulo: string
  /** O serviço da aula na data, em centavos. */
  valor: number
}

export function AcoesPendencia({
  pendenciaId,
  aulas,
  valorOrigem,
  remarcar = false,
}: {
  pendenciaId: number
  aulas: OpcaoAula[]
  /** O serviço da aula perdida, na data dela. */
  valorOrigem: number
  /** A reposição já está marcada: o botão passa a remarcar. */
  remarcar?: boolean
}) {
  const [destino, setDestino] = useState('')
  // Julio, 24/11/2026: destino mais barato pergunta se a diferença vira
  // crédito, já marcado sim. O crédito só nasce com a presença na reposição.
  const [gerarCredito, setGerarCredito] = useState(true)
  const escolhida = aulas.find((a) => String(a.id) === destino)
  const diferenca = escolhida ? diferencaDaReposicao(valorOrigem, escolhida.valor) : 0
  // Desistencia: a regra pede a decisao de cobranca antes de registrar.
  const [desistindo, setDesistindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function executar(fn: () => Promise<{ ok: boolean; erros?: string[]; avisos?: string[] }>) {
    setErro(null)
    iniciar(async () => {
      const r = await fn()
      // Opcao A (13/11/2026): a aula saiu de uma cobranca ja mandada.
      if (r.ok && r.avisos?.length) window.alert(r.avisos.join('\n'))
      if (!r.ok) setErro(r.erros?.join(' ') ?? 'Não foi possível concluir.')
    })
  }

  if (desistindo) {
    return (
      <div className="flex flex-col gap-2">
        <PerguntasDeCobranca
          pendente={pendente}
          onVoltar={() => setDesistindo(false)}
          onDecidir={(d) => executar(() => desistir(pendenciaId, d))}
        />
        {erro && (
          <p role="alert" className="rounded-campo bg-erro-suave px-3 py-2 text-sm text-erro">
            {erro}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={destino}
          onChange={(e) => {
            setDestino(e.target.value)
            setGerarCredito(true)
          }}
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
          onClick={() => executar(() => agendar(pendenciaId, Number(destino), diferenca > 0 ? gerarCredito : undefined))}
        >
          {remarcar ? 'Remarcar' : 'Agendar'}
        </Botao>

        <Botao
          type="button"
          aparencia="secundario"
          disabled={pendente}
          onClick={() => setDesistindo(true)}
        >
          Desistiu
        </Botao>
      </div>

      {diferenca > 0 && (
        <label className="flex items-start gap-2 rounded-campo bg-alerta-suave px-3 py-2 text-sm">
          <input type="checkbox" checked={gerarCredito} onChange={(e) => setGerarCredito(e.target.checked)} className="mt-1" />
          <span>
            Esta aula custa {formatarBRL(diferenca)} a menos que a perdida.{' '}
            <span className="font-medium">Gerar crédito de {formatarBRL(diferenca)} quando ele fizer a reposição</span>
          </span>
        </label>
      )}

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-3 py-2 text-sm text-erro">
          {erro}
        </p>
      )}
    </div>
  )
}
