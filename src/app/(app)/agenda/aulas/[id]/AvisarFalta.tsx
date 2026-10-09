'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { registrarFaltaAvisada } from '../../../reposicoes/acoes'
import { PerguntasDeCobranca } from '../../../reposicoes/PerguntasDeCobranca'
import type { Decisao } from '@/dominio/reposicoes/desfecho'

/**
 * A gestora registra que o aluno avisou que não vem.
 *
 * Fica ao lado do nome, na própria lista da aula, porque é ali que ela está
 * olhando quando o responsável manda a mensagem.
 *
 * Regra de 09/10/2026: primeiro, gerar reposição? Se não, a mesma decisão da
 * desistência — cobrar a aula? E, cobrando, pagar o professor?
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
  const [etapa, setEtapa] = useState<'fechado' | 'reposicao' | 'cobranca'>('fechado')
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function registrar(decisao: { gerarReposicao: true } | ({ gerarReposicao: false } & Decisao)) {
    iniciar(async () => {
      const r = await registrarFaltaAvisada(alunoId, aulaId, decisao)
      if (r.ok) router.refresh()
      else setErro(r.erros?.[0] ?? 'Não foi possível registrar.')
    })
  }

  if (erro) return <span className="text-sm text-erro">{erro}</span>

  if (etapa === 'fechado') {
    return (
      <button
        type="button"
        onClick={() => setEtapa('reposicao')}
        className="min-h-[44px] shrink-0 text-sm font-medium text-tinta-suave underline-offset-4 hover:text-destaque hover:underline"
      >
        Avisou que não vem
      </button>
    )
  }

  if (etapa === 'cobranca') {
    return (
      <PerguntasDeCobranca
        pendente={pendente}
        onVoltar={() => setEtapa('reposicao')}
        onDecidir={(d) => registrar({ gerarReposicao: false, ...d })}
      />
    )
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
      <span className="text-tinta-suave">Gerar reposição para {nome.split(' ')[0]}?</span>
      <button
        type="button"
        disabled={pendente}
        onClick={() => registrar({ gerarReposicao: true })}
        className="min-h-[44px] font-medium text-destaque underline-offset-4 hover:underline"
      >
        {pendente ? 'Registrando…' : 'Sim'}
      </button>
      <button
        type="button"
        disabled={pendente}
        onClick={() => setEtapa('cobranca')}
        className="min-h-[44px] font-medium text-destaque underline-offset-4 hover:underline"
      >
        Não
      </button>
      <button
        type="button"
        onClick={() => setEtapa('fechado')}
        className="min-h-[44px] text-tinta-suave underline-offset-4 hover:underline"
      >
        Cancelar
      </button>
    </span>
  )
}
