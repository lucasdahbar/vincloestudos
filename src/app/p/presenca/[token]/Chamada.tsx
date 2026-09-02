'use client'

import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { confirmarPresencas, confirmarPresencasDoProfessor } from './acoes'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'

interface Aluno {
  aluno_id: number
  nome: string
  flag_reposicao: boolean
}

export function Chamada({
  token,
  turmaNome,
  quando,
  alunos,
  aulaId,
}: {
  token: string
  turmaNome: string
  quando: string
  alunos: Aluno[]
  /**
   * R1: presente quando a chamada veio do link permanente do professor, em que
   * o token identifica a pessoa e nao a aula — entao a aula precisa ser dita.
   */
  aulaId?: number
}) {
  // Padrao Presente para todos (Operacionais 5.5): o caso comum nao deve dar trabalho.
  const [presentes, setPresentes] = useState<Record<number, boolean>>(
    Object.fromEntries(alunos.map((a) => [a.aluno_id, true])),
  )
  const [observacoes, setObservacoes] = useState<Record<number, string>>({})
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  function enviar() {
    iniciar(async () => {
      const respostas = alunos.map((a) => ({
        aluno_id: a.aluno_id,
        presente: presentes[a.aluno_id],
        observacao: observacoes[a.aluno_id],
      }))

      const r =
        aulaId === undefined
          ? await confirmarPresencas(token, respostas)
          : await confirmarPresencasDoProfessor(token, aulaId, respostas)
      setResultado(
        r.ok
          ? {
              ok: true,
              texto:
                r.ausentes.length === 0
                  ? 'Presenças confirmadas. Obrigado!'
                  : `Presenças confirmadas. Faltaram: ${r.ausentes.join(', ')}. A gestora foi avisada.`,
            }
          : { ok: false, texto: r.motivo },
      )
    })
  }

  if (resultado?.ok) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-cartao border border-borda bg-apoio-suave p-8 text-center"
      >
        <p className="font-titulo text-2xl text-apoio">Tudo certo!</p>
        <p className="mt-2 text-tinta-suave">{resultado.texto}</p>
        <p className="mt-6 text-sm text-tinta-suave">Você já pode fechar esta página.</p>
      </motion.div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-titulo text-2xl leading-snug">{turmaNome}</h1>
        <p className="mt-1 text-tinta-suave">{quando}</p>
      </header>

      <ul className="flex flex-col gap-3">
        {alunos.map((aluno) => {
          const presente = presentes[aluno.aluno_id]
          return (
            <li
              key={aluno.aluno_id}
              className="rounded-cartao border border-borda bg-superficie p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium">
                  {aluno.nome}
                  {aluno.flag_reposicao && (
                    <span className="ml-2 rounded-full bg-alerta-suave px-2 py-0.5 text-sm text-alerta">
                      reposição
                    </span>
                  )}
                </span>

                <div className="flex gap-2" role="group" aria-label={`Presença de ${aluno.nome}`}>
                  {[true, false].map((valor) => (
                    <button
                      key={String(valor)}
                      type="button"
                      aria-pressed={presente === valor}
                      onClick={() =>
                        setPresentes((a) => ({ ...a, [aluno.aluno_id]: valor }))
                      }
                      className={`min-h-[44px] rounded-campo border px-5 font-medium transition-all active:scale-95 ${
                        presente === valor
                          ? valor
                            ? 'border-apoio bg-apoio text-white'
                            : 'border-alerta bg-alerta text-white'
                          : 'border-borda bg-superficie text-tinta-suave'
                      }`}
                    >
                      {valor ? 'Presente' : 'Faltou'}
                    </button>
                  ))}
                </div>
              </div>

              {!presente && (
                <motion.input
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  type="text"
                  placeholder="Observação (opcional)"
                  value={observacoes[aluno.aluno_id] ?? ''}
                  onChange={(e) =>
                    setObservacoes((o) => ({ ...o, [aluno.aluno_id]: e.target.value }))
                  }
                  className={`${entradaClasse} mt-3`}
                />
              )}
            </li>
          )
        })}
      </ul>

      {resultado && !resultado.ok && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {resultado.texto}
        </p>
      )}

      <Botao onClick={enviar} disabled={pendente} className="w-full">
        {pendente ? 'Confirmando…' : 'Confirmar presenças'}
      </Botao>
    </div>
  )
}
