'use client'

import { useActionState } from 'react'
import { motion } from 'motion/react'
import { entrar } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { entrada } from '@/ui/animacoes'
import { MARCA } from '@/marca'

export default function PaginaLogin() {
  const [erro, acao, pendente] = useActionState(entrar, null)

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.div variants={entrada} initial="oculto" animate="visivel" className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl">{MARCA}</h1>
          <p className="mt-2 text-tinta-suave">Entre para acessar o sistema</p>
        </div>

        <form action={acao} className="flex flex-col gap-5">
          <Campo etiqueta="E-mail" obrigatorio>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className={entradaClasse}
            />
          </Campo>

          <Campo etiqueta="Senha" obrigatorio>
            <input
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              className={entradaClasse}
            />
          </Campo>

          {erro && (
            <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
              {erro}
            </p>
          )}

          <Botao type="submit" disabled={pendente}>
            {pendente ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </motion.div>
    </main>
  )
}
