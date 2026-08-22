'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { consultarExclusao, excluirCadastro } from './acoes'
import { Botao } from '@/ui/Botao'

/**
 * Exclusao com direito ao esquecimento (LGPD, Art. 18).
 *
 * A gestora ve ANTES o que vai acontecer — apagar de vez ou anonimizar — e por
 * que. Sem isso ela nao teria como saber que "excluir" as vezes preserva o
 * registro financeiro, e ficaria achando que o sistema ignorou o comando.
 */
export function BotaoExcluir({
  entidade,
  id,
  nome,
  rota,
}: {
  entidade: string
  id: number
  nome: string
  rota: string
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [previa, setPrevia] = useState<{ acao: string; motivo: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function abrir() {
    setErro(null)
    iniciar(async () => {
      setPrevia(await consultarExclusao(entidade, id))
      setAberto(true)
    })
  }

  return (
    <>
      <Botao aparencia="perigo" type="button" disabled={pendente} onClick={abrir}>
        {pendente && !aberto ? 'Verificando…' : 'Excluir cadastro'}
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
              aria-labelledby="titulo-exclusao"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-painel border border-borda bg-superficie p-6 shadow-elevado"
            >
              <h2 id="titulo-exclusao" className="text-xl">
                {previa.acao === 'excluir' ? 'Excluir' : 'Anonimizar'} {nome}?
              </h2>
              <p className="mt-3 text-tinta-suave">{previa.motivo}</p>

              {previa.acao === 'anonimizar' && (
                <p className="mt-3 rounded-campo bg-alerta-suave px-4 py-3 text-sm text-alerta">
                  O nome, o telefone, o e-mail e o documento serão apagados e não têm como
                  voltar. O histórico continua, sem identificar a pessoa.
                </p>
              )}

              {erro && (
                <p role="alert" className="mt-3 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
                  {erro}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <Botao
                  aparencia="perigo"
                  disabled={pendente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await excluirCadastro(entidade, id)
                      if (r.ok) {
                        setAberto(false)
                        router.push(`/cadastros/${rota}`)
                        router.refresh()
                      } else {
                        setErro(r.erro ?? 'Não foi possível concluir.')
                      }
                    })
                  }
                >
                  {pendente
                    ? 'Processando…'
                    : previa.acao === 'excluir'
                      ? 'Sim, excluir'
                      : 'Sim, anonimizar'}
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
