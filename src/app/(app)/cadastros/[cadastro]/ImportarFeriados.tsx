'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { importarFeriadosNacionais } from './acoes-feriados'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { Campo, entradaClasse } from '@/ui/Campo'

/**
 * Carrega os feriados nacionais do ano de uma fonte publica, em vez de a
 * gestora digitar os mesmos treze feriados todo ano.
 *
 * O cadastro manual continua logo abaixo, e continua necessario: a fonte cobre
 * so os NACIONAIS. Feriado estadual, municipal e ponto facultativo — que sao
 * justamente os que dependem da cidade dela — seguem sendo digitados.
 */
export function ImportarFeriados({ anoAtual }: { anoAtual: number }) {
  const router = useRouter()
  const [ano, setAno] = useState(String(anoAtual))
  const [pendente, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Carregar feriados nacionais</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Busca os feriados nacionais do ano e acrescenta os que ainda não estão na lista.
          Rodar de novo não duplica nada. Feriados estaduais, municipais e pontos facultativos
          continuam sendo cadastrados aqui embaixo, à mão.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Ano">
          <input
            type="number"
            inputMode="numeric"
            value={ano}
            min={1900}
            max={2199}
            onChange={(e) => setAno(e.target.value)}
            className={`${entradaClasse} max-w-[8rem]`}
          />
        </Campo>

        <Botao
          type="button"
          disabled={pendente || ano.trim() === ''}
          onClick={() =>
            iniciar(async () => {
              setAviso(null)
              const r = await importarFeriadosNacionais(Number(ano))

              if (!r.ok) {
                setAviso({ tom: 'erro', texto: r.motivo ?? 'Não foi possível carregar.' })
                return
              }

              setAviso({
                tom: 'ok',
                texto:
                  r.criados === 0
                    ? `Nada novo: os ${r.jaExistiam} feriados nacionais de ${ano} já estavam na lista.`
                    : `${r.criados} feriado(s) adicionado(s)` +
                      (r.jaExistiam ? `, ${r.jaExistiam} já existia(m).` : '.'),
              })
              router.refresh()
            })
          }
        >
          {pendente ? 'Buscando…' : `Carregar feriados de ${ano}`}
        </Botao>
      </div>

      {aviso && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role={aviso.tom === 'erro' ? 'alert' : undefined}
          className={`rounded-campo px-4 py-3 text-sm ${
            aviso.tom === 'erro' ? 'bg-erro-suave text-erro' : 'bg-apoio-suave text-apoio'
          }`}
        >
          {aviso.texto}
        </motion.p>
      )}
    </Cartao>
  )
}
