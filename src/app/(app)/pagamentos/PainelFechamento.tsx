'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { calcular, fechar } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'
import { formatarBRL } from '@/dominio/dinheiro'

interface ItemPrevia {
  aluno_nome: string
  turma_nome: string
  data_aula: string
  valor_servico: number
  percentual_aplicado: number
  valor_professor: number
}

export function PainelFechamento({ professores }: { professores: { id: number; nome: string }[] }) {
  const router = useRouter()
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [professorId, setProfessorId] = useState<number | null>(professores[0]?.id ?? null)
  const [de, setDe] = useState(primeiro)
  const [ate, setAte] = useState(ultimo)
  const [previa, setPrevia] = useState<{ valor_total: number; itens: ItemPrevia[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Fechar o período de um professor</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Soma o valor de cada aula com presença confirmada no período, aplicando o percentual de
          repasse vigente na data da aula. Ausências e aulas sem chamada não entram.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Professor" obrigatorio>
          <select
            value={professorId ?? ''}
            onChange={(e) => setProfessorId(e.target.value ? Number(e.target.value) : null)}
            className={entradaClasse}
          >
            {professores.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="De" obrigatorio>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={entradaClasse} />
        </Campo>
        <Campo etiqueta="Até" obrigatorio>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={entradaClasse} />
        </Campo>
      </div>

      <div className="flex flex-wrap gap-3">
        <Botao
          type="button"
          aparencia="secundario"
          disabled={pendente || professorId === null}
          onClick={() =>
            iniciar(async () => {
              setErro(null)
              setPrevia(await calcular(professorId!, de, ate))
            })
          }
        >
          {pendente ? 'Calculando…' : 'Calcular'}
        </Botao>

        {previa && previa.itens.length > 0 && (
          <Botao
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await fechar(professorId!, de, ate)
                if (r.ok) {
                  setPrevia(null)
                  router.refresh()
                } else {
                  setErro(r.erros?.join(' ') ?? 'Falha ao fechar.')
                }
              })
            }
          >
            Gerar conta a pagar
          </Botao>
        )}
      </div>

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">{erro}</p>
      )}

      {previa && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          {previa.itens.length === 0 ? (
            <p className="rounded-campo bg-superficie-2 px-4 py-3 text-tinta-suave">
              Nenhuma presença confirmada e ainda não paga neste período.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-cartao border border-borda">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-borda bg-superficie-2/60 text-tinta-suave">
                      <th className="px-4 py-2 font-semibold">Data</th>
                      <th className="px-4 py-2 font-semibold">Aluno</th>
                      <th className="px-4 py-2 font-semibold">Turma</th>
                      <th className="px-4 py-2 font-semibold">Aula</th>
                      <th className="px-4 py-2 font-semibold">%</th>
                      <th className="px-4 py-2 font-semibold">Professor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.itens.map((i, n) => (
                      <tr key={n} className="border-b border-borda/60 last:border-0">
                        <td className="px-4 py-2">{i.data_aula.split('-').reverse().join('/')}</td>
                        <td className="px-4 py-2">{i.aluno_nome}</td>
                        <td className="px-4 py-2 text-tinta-suave">{i.turma_nome.slice(0, 34)}</td>
                        <td className="px-4 py-2">{formatarBRL(i.valor_servico)}</td>
                        <td className="px-4 py-2">{i.percentual_aplicado}%</td>
                        <td className="px-4 py-2 font-medium">{formatarBRL(i.valor_professor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-right font-titulo text-2xl">
                Total: {formatarBRL(previa.valor_total)}
              </p>
            </>
          )}
        </motion.div>
      )}
    </Cartao>
  )
}
