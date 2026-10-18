'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aprovar, recusar } from './acoes'
import { Botao } from '@/ui/Botao'
import type { ResponsavelParecido } from '@/dados/cadastro-publico'

/**
 * Aprovar ou recusar um envio. Quando ja existe responsavel com o mesmo CPF,
 * e-mail ou telefone, a gestora escolhe: vincular os alunos a ele (os dados
 * dele ficam como estao) ou criar um responsavel novo.
 */
export function DecisaoEnvio({
  envioId,
  parecidos,
}: {
  envioId: number
  parecidos: ResponsavelParecido[]
}) {
  // Com CPF igual, o padrao e vincular: e quase certo que e a mesma pessoa.
  const mesmoCpf = parecidos.find((p) => p.coincide.includes('CPF'))
  const [destino, setDestino] = useState<number | null>(mesmoCpf?.id ?? null)
  const [confirmandoRecusa, setConfirmandoRecusa] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  function aoAprovar() {
    setErro(null)
    iniciar(async () => {
      const r = await aprovar(envioId, destino)
      if (r.ok) router.push(`/cadastros/responsaveis/${r.responsavelId}`)
      else setErro(r.motivo)
    })
  }

  function aoRecusar() {
    setErro(null)
    iniciar(async () => {
      const r = await recusar(envioId)
      if (!r.ok) setErro(r.motivo ?? 'Não foi possível recusar.')
    })
  }

  return (
    <div className="flex flex-col gap-4 border-t border-borda pt-4">
      {parecidos.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">Já existe um responsável parecido</legend>
          {parecidos.map((p) => (
            <label key={p.id} className="flex min-h-[44px] items-center gap-3">
              <input
                type="radio"
                name={`destino-${envioId}`}
                className="h-5 w-5 accent-destaque"
                checked={destino === p.id}
                onChange={() => setDestino(p.id)}
              />
              <span>
                Vincular os alunos a <strong>{p.nome}</strong>{' '}
                <span className="text-sm text-tinta-suave">(mesmo {p.coincide.join(', ')})</span>
              </span>
            </label>
          ))}
          <label className="flex min-h-[44px] items-center gap-3">
            <input
              type="radio"
              name={`destino-${envioId}`}
              className="h-5 w-5 accent-destaque"
              checked={destino === null}
              onChange={() => setDestino(null)}
            />
            <span>Criar um responsável novo</span>
          </label>
          {destino !== null && (
            <p className="text-sm text-tinta-suave">
              Os dados do responsável já cadastrado não mudam. Se o envio trouxe algo mais
              novo, corrija no cadastro dele depois.
            </p>
          )}
        </fieldset>
      )}

      {!confirmandoRecusa ? (
        <div className="flex flex-wrap gap-3">
          <Botao type="button" onClick={aoAprovar} disabled={pendente}>
            {pendente ? 'Salvando…' : 'Aprovar cadastro'}
          </Botao>
          <Botao
            type="button"
            aparencia="secundario"
            onClick={() => setConfirmandoRecusa(true)}
            disabled={pendente}
          >
            Recusar
          </Botao>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-erro">
            O envio sai da fila e é apagado em 30 dias. Use para cadastro falso, repetido ou
            enviado por engano.
          </p>
          <div className="flex flex-wrap gap-3">
            <Botao type="button" aparencia="perigo" onClick={aoRecusar} disabled={pendente}>
              {pendente ? 'Recusando…' : 'Sim, recusar'}
            </Botao>
            <Botao type="button" aparencia="secundario" onClick={() => setConfirmandoRecusa(false)}>
              Voltar
            </Botao>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erro}
        </p>
      )}
    </div>
  )
}
