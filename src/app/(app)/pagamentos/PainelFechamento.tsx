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
  /** Rodada 3: aula que nao aconteceu, paga por decisao da gestora. */
  desistencia?: boolean
  turma_nome: string
  data_aula: string
  valor_servico: number
  percentual_aplicado: number
  valor_professor: number
}

interface AulaAguardando {
  aluno_nome: string
  turma_nome: string
  data_aula: string
  desistencia: boolean
  motivo: string
}

export function PainelFechamento({ professores }: { professores: { id: number; nome: string }[] }) {
  const router = useRouter()
  // P2: a data padrão é hoje. O sistema varre tudo o que ainda não foi
  // reservado por outro fechamento, então não há data inicial a escolher.
  const hoje = new Date()
  const dataDeHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  const [professorId, setProfessorId] = useState<number | null>(professores[0]?.id ?? null)
  const [ate, setAte] = useState(dataDeHoje)
  const [previa, setPrevia] = useState<{
    valor_total: number
    itens: ItemPrevia[]
    aguardando: AulaAguardando[]
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Fechar o período de um professor</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Soma o valor de cada aula com presença confirmada e cobrança já confirmada até a data
          escolhida, aplicando o percentual de repasse vigente na data da aula. O valor é o que
          foi efetivamente cobrado, com os ajustes e descontos que você deu na cobrança. Aulas
          com presença mas sem cobrança confirmada aparecem à parte, como lembrete, e não
          entram na soma. Ausências, aulas sem chamada e presenças que já entraram em outro
          fechamento também não entram — então não é preciso informar uma data de início.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
        <Campo etiqueta="Até" ajuda="Entram as aulas até esta data." obrigatorio>
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
              setPrevia(await calcular(professorId!, ate))
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
                const r = await fechar(professorId!, ate)
                if (r.ok) {
                  // Decisao 3: nasce rascunho; a gestora confere e confirma la.
                  setPrevia(null)
                  router.push(`/pagamentos/${r.id}`)
                } else {
                  setErro(r.erros?.join(' ') ?? 'Falha ao fechar.')
                }
              })
            }
          >
            Gerar rascunho
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
              {previa.aguardando.length > 0
                ? 'Nenhuma aula com cobrança confirmada até esta data. Veja abaixo as aulas que esperam a cobrança.'
                : 'Nenhuma presença confirmada e ainda não paga até esta data.'}
            </p>
          ) : (
            <>
              {/* Celular: cartao por aula, com a conta do repasse legivel. */}
              <ul className="flex flex-col gap-2 sm:hidden">
                {previa.itens.map((i, n) => (
                  <li key={n} className="rounded-campo border border-borda bg-superficie p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-medium">{i.aluno_nome}{i.desistencia && ' (desistência paga)'}</span>
                      <span className="font-medium">{formatarBRL(i.valor_professor)}</span>
                    </div>
                    <p className="mt-1 text-tinta-suave">
                      {i.data_aula.split('-').reverse().join('/')} · {i.turma_nome}
                    </p>
                    <p className="mt-0.5 text-tinta-tenue">
                      {formatarBRL(i.valor_servico)} cobrado x {i.percentual_aplicado}%
                    </p>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto rounded-cartao border border-borda sm:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-borda bg-superficie-2/60 text-tinta-suave">
                      <th className="px-4 py-2 font-semibold">Data</th>
                      <th className="px-4 py-2 font-semibold">Aluno</th>
                      <th className="px-4 py-2 font-semibold">Turma</th>
                      <th className="px-4 py-2 font-semibold">Cobrado</th>
                      <th className="px-4 py-2 font-semibold">%</th>
                      <th className="px-4 py-2 font-semibold">Professor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.itens.map((i, n) => (
                      <tr key={n} className="border-b border-borda/60 last:border-0">
                        <td className="px-4 py-2">{i.data_aula.split('-').reverse().join('/')}</td>
                        <td className="px-4 py-2">{i.aluno_nome}{i.desistencia && ' (desistência paga)'}</td>
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

          {previa.aguardando.length > 0 && (
            <div role="status" className="mt-6 rounded-campo bg-alerta-suave px-4 py-3">
              <h3 className="text-base font-medium">
                {previa.aguardando.length}{' '}
                {previa.aguardando.length === 1 ? 'aula esperando' : 'aulas esperando'} a cobrança
              </h3>
              <p className="mt-1 text-sm text-tinta-suave">
                Tiveram presença confirmada, mas a cobrança ainda não foi confirmada. Não entram no
                total acima: feche as cobranças para que entrem no próximo cálculo.
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {previa.aguardando.map((a, n) => (
                  <li key={n} className="flex flex-wrap justify-between gap-x-4">
                    <span>
                      {a.data_aula.split('-').reverse().join('/')} · {a.aluno_nome}
                      {a.desistencia && ' (desistência paga)'} · {a.turma_nome.slice(0, 34)}
                    </span>
                    <span className="text-tinta-suave">{a.motivo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </Cartao>
  )
}
