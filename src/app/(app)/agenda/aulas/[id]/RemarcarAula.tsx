'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { remarcarAula } from '../../acoes'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'

const ddmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/**
 * Remarcar uma aula (pedido do tio, 13/10/2026): muda só dia e horário desta
 * aula. Alunos, cobrança e reposição seguem como estavam, e o Google do
 * professor acompanha. Horários no relógio da escola, AAAA-MM-DDTHH:MM.
 */
export function RemarcarAula({
  aulaId,
  inicio,
  fim,
  original,
  fimOriginal,
}: {
  aulaId: number
  inicio: string
  fim: string
  /** Horário de sempre, quando a aula já foi remarcada. */
  original: string | null
  fimOriginal: string | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(inicio.slice(0, 10))
  const [horaInicio, setHoraInicio] = useState(inicio.slice(11, 16))
  const [horaFim, setHoraFim] = useState(fim.slice(11, 16))
  const [alerta, setAlerta] = useState<string | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [pendente, iniciar] = useTransition()

  function abrir() {
    setData(inicio.slice(0, 10))
    setHoraInicio(inicio.slice(11, 16))
    setHoraFim(fim.slice(11, 16))
    setAlerta(null)
    setErros([])
    setAberto(true)
  }

  function voltarAoDeSempre() {
    if (!original || !fimOriginal) return
    setData(original.slice(0, 10))
    setHoraInicio(original.slice(11, 16))
    setHoraFim(fimOriginal.slice(11, 16))
    setAlerta(null)
  }

  function salvar(confirmouAlerta: boolean) {
    setErros([])
    iniciar(async () => {
      try {
        const r = await remarcarAula(aulaId, { data, inicio: horaInicio, fim: horaFim }, confirmouAlerta)
        if (r.ok) {
          setAberto(false)
          router.refresh()
        } else if (r.alerta) {
          setAlerta(r.alerta)
        } else {
          setErros(r.erros ?? ['Não foi possível remarcar a aula.'])
        }
      } catch {
        setErros(['Não foi possível remarcar a aula agora. Tente de novo.'])
      }
    })
  }

  // Mexer no horário depois do aviso de feriado pede outra conferência.
  const mudou = (f: () => void) => {
    f()
    setAlerta(null)
  }

  return (
    <>
      <Botao aparencia="secundario" type="button" onClick={abrir}>
        Remarcar esta aula
      </Botao>

      <AnimatePresence>
        {aberto && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-tinta/30"
              onClick={() => setAberto(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-remarcar-aula"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-painel border border-borda bg-superficie p-6 shadow-elevado"
            >
              <h2 id="titulo-remarcar-aula" className="text-xl">
                Remarcar esta aula
              </h2>
              <p className="mt-2 text-sm text-tinta-suave">
                Só esta aula muda de dia e horário. Os alunos, a cobrança e as reposições continuam
                como estão, e a agenda do professor no Google acompanha.
              </p>
              {original && (
                <p className="mt-2 text-sm">
                  O horário de sempre desta aula é {ddmmaaaa(original)} às {original.slice(11, 16)}.{' '}
                  <button
                    type="button"
                    onClick={voltarAoDeSempre}
                    className="text-destaque underline"
                  >
                    Voltar ao horário de sempre
                  </button>
                </p>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Dia</span>
                  <input
                    type="date"
                    value={data}
                    onChange={(e) => mudou(() => setData(e.target.value))}
                    className={entradaClasse}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Início</span>
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => mudou(() => setHoraInicio(e.target.value))}
                    className={entradaClasse}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Término</span>
                  <input
                    type="time"
                    value={horaFim}
                    onChange={(e) => mudou(() => setHoraFim(e.target.value))}
                    className={entradaClasse}
                  />
                </label>
              </div>

              {alerta && (
                <div role="alert" className="mt-4 rounded-campo bg-alerta-suave px-4 py-3 text-sm">
                  {alerta} Remarcar mesmo assim?
                </div>
              )}

              {erros.length > 0 && (
                <ul role="alert" className="mt-4 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
                  {erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Botao disabled={pendente} onClick={() => salvar(alerta !== null)}>
                  {pendente ? 'Remarcando…' : alerta ? 'Sim, remarcar' : 'Remarcar'}
                </Botao>
                <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                  Cancelar
                </Botao>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
