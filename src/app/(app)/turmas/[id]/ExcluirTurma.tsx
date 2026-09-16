'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { consultarExclusaoTurma, excluirTurma, type PreviaExclusaoTurma } from '../acoes'
import { Botao } from '@/ui/Botao'

/**
 * Exclui a turma, no mesmo desenho do BotaoExcluir dos cadastros: consulta
 * primeiro, mostra o que vai acontecer, e so entao pergunta.
 *
 * Matricula, aula e pagamento seguram a turma no banco (`on delete restrict`).
 * Quem le precisa saber disso ANTES de clicar, e saber que o caminho nesse
 * caso e encerrar — nao ficar tentando excluir contra um erro do banco.
 */
export function ExcluirTurma({ id, nome }: { id: number; nome: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [previa, setPrevia] = useState<PreviaExclusaoTurma | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function abrir() {
    setErro(null)
    iniciar(async () => {
      setPrevia(await consultarExclusaoTurma(id))
      setAberto(true)
    })
  }

  return (
    <>
      <Botao aparencia="perigo" type="button" disabled={pendente} onClick={abrir}>
        {pendente && !aberto ? 'Verificando…' : 'Excluir turma'}
      </Botao>

      <AnimatePresence>
        {aberto && previa && (
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
              aria-labelledby="titulo-exclusao-turma"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-painel border border-borda bg-superficie p-6 shadow-elevado"
            >
              <h2 id="titulo-exclusao-turma" className="text-xl">
                {previa.podeExcluir ? `Excluir ${nome}?` : 'Esta turma não pode ser excluída'}
              </h2>
              <p className="mt-3 text-tinta-suave">{previa.motivo}</p>

              {erro && (
                <p
                  role="alert"
                  className="mt-3 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro"
                >
                  {erro}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {previa.podeExcluir ? (
                  <>
                    <Botao
                      aparencia="perigo"
                      disabled={pendente}
                      onClick={() =>
                        iniciar(async () => {
                          const r = await excluirTurma(id)
                          if (r.ok) {
                            setAberto(false)
                            router.push('/turmas')
                            router.refresh()
                          } else {
                            setErro(r.erro ?? 'Não foi possível excluir.')
                          }
                        })
                      }
                    >
                      {pendente ? 'Excluindo…' : 'Sim, excluir'}
                    </Botao>
                    <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                      Cancelar
                    </Botao>
                  </>
                ) : (
                  <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                    Entendi
                  </Botao>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
