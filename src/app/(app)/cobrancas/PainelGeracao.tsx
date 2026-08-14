'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { gerar } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

export function PainelGeracao({ mesInicial }: { mesInicial: string }) {
  const router = useRouter()
  const [mes, setMes] = useState(mesInicial)
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<string | null>(null)

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Gerar cobranças do mês</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Cria uma cobrança por responsável, juntando todos os filhos e todas as turmas. Fica em
          rascunho para você revisar antes de confirmar. Rodar de novo não duplica nada.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Mês de referência">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={`${entradaClasse} max-w-[12rem]`}
          />
        </Campo>

        <Botao
          type="button"
          disabled={pendente || !mes}
          onClick={() =>
            iniciar(async () => {
              const r = await gerar(mes)
              setResultado(
                r.itens === 0
                  ? 'Nada novo a cobrar neste mês — tudo já estava cobrado.'
                  : `${r.criadas} cobrança(s) criada(s) com ${r.itens} aula(s).`,
              )
              router.refresh()
            })
          }
        >
          {pendente ? 'Gerando…' : 'Gerar cobranças'}
        </Botao>
      </div>

      {resultado && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-campo bg-apoio-suave px-4 py-3 text-apoio"
        >
          {resultado}
        </motion.p>
      )}
    </Cartao>
  )
}
