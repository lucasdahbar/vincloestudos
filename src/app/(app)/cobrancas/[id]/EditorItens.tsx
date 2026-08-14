'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { confirmar, marcarEnviada, salvarDesconto } from '../acoes'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'

interface Item {
  id: number
  aluno_nome: string
  descricao: string
  data: string
  valor_original: number
  desconto: number
  valor_final: number
}

export function EditorItens({
  cobrancaId,
  itens,
  status,
  texto,
}: {
  cobrancaId: number
  itens: Item[]
  status: string
  texto: string | null
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const editavel = status === 'Rascunho'

  return (
    <div className="flex flex-col gap-6">
      {/* Celular: um cartao por item. A tabela de 40rem obrigaria a rolar de
          lado para ver o valor final de cada aula. */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {itens.map((i) => (
          <li
            key={i.id}
            className="rounded-cartao border border-borda bg-superficie p-4 shadow-sutil"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">{i.aluno_nome}</span>
              <span className="font-medium">{formatarBRL(i.valor_final)}</span>
            </div>
            <p className="mt-1 text-sm text-tinta-suave">
              {i.data.split('-').reverse().join('/')} · {i.descricao}
            </p>
            {editavel ? (
              <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span className="text-tinta-suave">Desconto</span>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={(i.desconto / 100).toFixed(2).replace('.', ',')}
                  aria-label={`Desconto para ${i.aluno_nome}`}
                  onBlur={(e) =>
                    iniciar(async () => {
                      const r = await salvarDesconto(i.id, cobrancaId, e.target.value)
                      if (!r.ok) setErro(r.erro ?? 'Falha ao ajustar.')
                      else router.refresh()
                    })
                  }
                  className={`${entradaClasse} max-w-[8rem]`}
                />
              </label>
            ) : (
              i.desconto > 0 && (
                <p className="mt-1 text-sm text-tinta-tenue">
                  desconto de {formatarBRL(i.desconto)}
                </p>
              )
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-cartao border border-borda bg-superficie shadow-sutil sm:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-borda bg-superficie-2/60 text-sm text-tinta-suave">
              <th className="px-5 py-3 font-semibold">Aluno</th>
              <th className="px-5 py-3 font-semibold">Aula</th>
              <th className="px-5 py-3 font-semibold">Valor</th>
              <th className="px-5 py-3 font-semibold">Desconto</th>
              <th className="px-5 py-3 font-semibold">Final</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-b border-borda/60 last:border-0">
                <td className="px-5 py-3">{i.aluno_nome}</td>
                <td className="px-5 py-3 text-sm text-tinta-suave">
                  {i.data.split('-').reverse().join('/')} · {i.descricao}
                </td>
                <td className="px-5 py-3">{formatarBRL(i.valor_original)}</td>
                <td className="px-5 py-3">
                  {editavel ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={(i.desconto / 100).toFixed(2).replace('.', ',')}
                      aria-label={`Desconto para ${i.aluno_nome}`}
                      onBlur={(e) =>
                        iniciar(async () => {
                          const r = await salvarDesconto(i.id, cobrancaId, e.target.value)
                          if (!r.ok) setErro(r.erro ?? 'Falha ao ajustar.')
                          else router.refresh()
                        })
                      }
                      className={`${entradaClasse} max-w-[7rem]`}
                    />
                  ) : (
                    formatarBRL(i.desconto)
                  )}
                </td>
                <td className="px-5 py-3 font-medium">{formatarBRL(i.valor_final)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erro}
        </p>
      )}

      {editavel && (
        <Botao
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              await confirmar(cobrancaId)
              router.refresh()
            })
          }
        >
          Confirmar cobrança e gerar o texto
        </Botao>
      )}

      {texto && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg">Texto para o WhatsApp</h2>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-cartao border border-borda bg-superficie-2 p-5 font-mono text-sm">
            {texto}
          </pre>
          <div className="flex flex-wrap gap-3">
            <Botao
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(texto)
                setCopiado(true)
                setTimeout(() => setCopiado(false), 2500)
              }}
            >
              {copiado ? 'Copiado!' : 'Copiar texto'}
            </Botao>
            {status === 'Confirmada' && (
              <Botao
                type="button"
                aparencia="secundario"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    await marcarEnviada(cobrancaId)
                    router.refresh()
                  })
                }
              >
                Já enviei pelo WhatsApp
              </Botao>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
