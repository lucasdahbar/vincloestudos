'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { desconectarGoogle } from './acoes'
import { Botao } from '@/ui/Botao'

/** Desconectar é raro e tem consequência: pede confirmação. */
export function Desconectar() {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="min-h-[44px] self-start text-sm font-medium text-tinta-suave underline-offset-4 hover:text-erro hover:underline"
      >
        Desconectar
      </button>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3"
    >
      <p className="text-sm text-erro">
        O sistema para de criar e atualizar os eventos das turmas na agenda dos professores. Os
        eventos que já existem continuam lá.
      </p>
      <div className="flex flex-wrap gap-3">
        <Botao
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              await desconectarGoogle()
              router.refresh()
            })
          }
        >
          {pendente ? 'Desconectando…' : 'Sim, desconectar'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => setConfirmando(false)}>
          Cancelar
        </Botao>
      </div>
    </motion.div>
  )
}
