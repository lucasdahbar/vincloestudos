'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { gerar } from './acoes'
import { resumoDaGeracao } from '@/dominio/cobrancas/rascunho'
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
          rascunho para você revisar antes de confirmar. Cada vez que você gera, o rascunho do mês é
          refeito: entram as aulas novas, saem as que deixaram de valer (aluno desmatriculado, aula
          cancelada, “não cobrar”) e os descontos que você deu são mantidos. Cobrança já confirmada
          não muda.
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
                r.falhas.length === 0
                  ? resumoDaGeracao(r)
                  : `${resumoDaGeracao(r)} Atenção: ${r.falhas.length} ${r.falhas.length === 1 ? 'responsável não foi atualizado' : 'responsáveis não foram atualizados'} (${r.falhas[0]}). Gere de novo; se persistir, avise o suporte.`,
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
