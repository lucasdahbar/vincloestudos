'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { corrigirChamada } from '../../acoes'
import { Botao } from '@/ui/Botao'

export interface AlunoDaChamada {
  aluno_id: number
  nome: string
  presente: boolean
}

/**
 * A gestora corrige a chamada direto (pedido do tio, 13/10/2026), sem esperar
 * o professor. Falta que vira presença desfaz a reposição que ela gerou, e
 * presença que vira falta gera a reposição; o sistema recusa quando a falta já
 * teve reposição marcada ou decisão de cobrança, e quando o pagamento do
 * professor já fechou.
 */
export function CorrigirChamada({
  aulaId,
  alunos,
  travada,
}: {
  aulaId: number
  alunos: AlunoDaChamada[]
  /** Por que não dá para corrigir (pagamento fechado), ou null. */
  travada: string | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [presencas, setPresencas] = useState(() => new Map(alunos.map((a) => [a.aluno_id, a.presente])))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  if (travada) {
    return <p className="mt-3 text-sm text-tinta-suave">{travada}</p>
  }

  if (!aberto) {
    return (
      <Botao aparencia="secundario" className="mt-3" onClick={() => setAberto(true)}>
        Corrigir a chamada
      </Botao>
    )
  }

  const mudou = alunos.some((a) => presencas.get(a.aluno_id) !== a.presente)

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-campo bg-superficie-2 p-4">
      <p className="text-sm text-tinta-suave">
        Marque como cada aluno deveria estar. Quem passar a faltar ganha uma reposição pendente
        (salvo quem estava ali repondo); quem passar a constar como presente perde a que a falta
        tinha gerado.
      </p>

      <ul className="flex flex-col gap-2">
        {alunos.map((a) => {
          const presente = presencas.get(a.aluno_id) ?? true
          return (
            <li key={a.aluno_id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{a.nome}</span>
              <span className="flex gap-2" role="group" aria-label={`Presença de ${a.nome}`}>
                {([true, false] as const).map((valor) => (
                  <button
                    key={String(valor)}
                    type="button"
                    aria-pressed={presente === valor}
                    onClick={() => setPresencas((m) => new Map(m).set(a.aluno_id, valor))}
                    className={`min-h-[44px] rounded-campo border px-4 font-medium transition-all active:scale-95 ${
                      presente === valor
                        ? valor
                          ? 'border-apoio bg-apoio text-white'
                          : 'border-erro bg-erro text-white'
                        : 'border-borda bg-superficie text-tinta-suave'
                    }`}
                  >
                    {valor ? 'Presente' : 'Faltou'}
                  </button>
                ))}
              </span>
            </li>
          )
        })}
      </ul>

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Botao
          disabled={pendente || !mudou}
          onClick={() =>
            iniciar(async () => {
              setErro(null)
              try {
                const r = await corrigirChamada(
                  aulaId,
                  alunos.map((a) => ({ aluno_id: a.aluno_id, presente: presencas.get(a.aluno_id) ?? a.presente })),
                )
                if (r.ok) {
                  setAberto(false)
                  router.refresh()
                } else {
                  setErro(r.erro ?? 'Não foi possível corrigir a chamada.')
                }
              } catch {
                setErro('Não foi possível corrigir a chamada agora. Tente de novo.')
              }
            })
          }
        >
          {pendente ? 'Salvando…' : 'Salvar correção'}
        </Botao>
        <Botao
          aparencia="secundario"
          onClick={() => {
            // Descarta o que nao foi salvo: ao reabrir, a chamada como esta.
            setPresencas(new Map(alunos.map((a) => [a.aluno_id, a.presente])))
            setErro(null)
            setAberto(false)
          }}
        >
          Cancelar
        </Botao>
      </div>
    </div>
  )
}
