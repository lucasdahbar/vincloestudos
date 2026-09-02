'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { encerrarMatricula } from '../acoes'
import { Botao } from '@/ui/Botao'

/**
 * Desmatricular pede confirmacao porque a acao muda cobranca e chamada a partir
 * de hoje — e a gestora chega nesta tela vindo da turma, onde o clique foi so
 * "ver o aluno".
 */
export function EncerrarMatricula({ id, nome }: { id: number; nome: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  if (!confirmando) {
    return (
      <Botao type="button" aparencia="secundario" onClick={() => setConfirmando(true)}>
        Desmatricular {nome.split(' ')[0]}
      </Botao>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      <p className="text-sm text-erro">
        {nome} deixa de aparecer nas aulas e nas cobranças a partir de hoje. Você pode
        matriculá-lo de novo depois, se ele voltar.
      </p>
      <div className="flex flex-wrap gap-3">
        <Botao
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              try {
                await encerrarMatricula(id)
                router.refresh()
              } catch (e) {
                setErro(e instanceof Error ? e.message : 'Não foi possível desmatricular.')
              }
            })
          }
        >
          {pendente ? 'Desmatriculando…' : 'Sim, desmatricular'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => setConfirmando(false)}>
          Cancelar
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erro}
        </p>
      )}
    </motion.div>
  )
}
