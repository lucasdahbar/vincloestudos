'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import {
  cancelar,
  confirmar,
  descontoEmLote,
  escolherContaDeRecebimento,
  marcarEnviada,
  removerItem,
  salvarDesconto,
} from '../acoes'
import { DescontoEmLote } from './DescontoEmLote'
import { Cartao } from '@/ui/Cartao'
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

export interface ContaDeRecebimento {
  id: number
  nome: string
  chave_pix: string | null
}

export function EditorItens({
  cobrancaId,
  itens,
  status,
  texto,
  contas,
  contaRecebimentoId,
  temRecebimento,
  telefone,
}: {
  cobrancaId: number
  itens: Item[]
  status: string
  texto: string | null
  /** C5: as contas que podem receber. */
  contas: ContaDeRecebimento[]
  contaRecebimentoId: number | null
  /** C7: cobrança com pagamento registrado não pode ser cancelada. */
  temRecebimento: boolean
  telefone: string | null
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)
  const editavel = status === 'Rascunho'

  // C7: só faz sentido oferecer a ação quando ela pode dar certo.
  const podeCancelar =
    (status === 'Confirmada' || status === 'Enviada') && !temRecebimento

  // R4: mesmo padrão das outras telas — abrir a conversa já com o texto.
  const numero = (telefone ?? '').replace(/\D/g, '')
  const whatsapp =
    numero && texto
      ? `https://wa.me/${numero.startsWith('55') ? numero : `55${numero}`}?text=${encodeURIComponent(texto)}`
      : null

  function acao(executar: () => Promise<{ ok: boolean; motivo?: string }>) {
    iniciar(async () => {
      setErro(null)
      const r = await executar()
      if (r.ok) router.refresh()
      else setErro(r.motivo ?? 'Não foi possível concluir.')
    })
  }

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

            {/* C4: tirar uma aula que já se sabe que não vai acontecer. */}
            {editavel && (
              <button
                type="button"
                disabled={pendente}
                onClick={() => acao(() => removerItem(i.id, cobrancaId))}
                className="mt-3 min-h-[44px] text-sm font-medium text-erro underline-offset-4 hover:underline"
              >
                Excluir esta aula da cobrança
              </button>
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
              {editavel && (
                <th className="px-5 py-3 font-semibold">
                  <span className="sr-only">Ações</span>
                </th>
              )}
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
                {editavel && (
                  <td className="px-5 py-3">
                    {/* C4 */}
                    <button
                      type="button"
                      disabled={pendente}
                      aria-label={`Excluir a aula de ${i.aluno_nome} em ${i.data.split('-').reverse().join('/')}`}
                      onClick={() => acao(() => removerItem(i.id, cobrancaId))}
                      className="min-h-[44px] text-sm font-medium text-erro underline-offset-4 hover:underline"
                    >
                      Excluir
                    </button>
                  </td>
                )}
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

      {editavel && itens.length === 0 && (
        <Cartao className="border-alerta/30 bg-alerta-suave">
          <h2 className="text-lg text-alerta">Rascunho sem aulas</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Este rascunho não tem nenhuma aula, então não há o que cobrar. Ele pode ter ficado
            para trás de uma geração anterior. Gere as cobranças do mês de novo, ou ignore este
            rascunho — ele não vira cobrança enquanto estiver assim.
          </p>
        </Cartao>
      )}

      {/* C3: o mesmo desconto para todas as aulas de um grupo. */}
      {editavel && itens.length > 1 && (
        <DescontoEmLote
          itens={itens}
          pendente={pendente}
          aplicar={(ids, valor) => acao(() => descontoEmLote(cobrancaId, ids, valor))}
        />
      )}

      {/* C5: qual chave Pix vai no texto. Só editável no rascunho. */}
      {contas.length > 0 && (
        <Cartao className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-medium">Conta que vai receber</span>
            <span className="text-sm text-tinta-suave">
              É a chave Pix que aparece no texto enviado ao responsável.
              {!editavel && ' Depois de confirmada, não muda mais.'}
            </span>
            <select
              value={contaRecebimentoId ?? ''}
              disabled={!editavel || pendente}
              onChange={(e) =>
                acao(() =>
                  escolherContaDeRecebimento(
                    cobrancaId,
                    e.target.value ? Number(e.target.value) : null,
                  ),
                )
              }
              className={`${entradaClasse} mt-1 max-w-sm disabled:opacity-60`}
            >
              <option value="">Conta padrão</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.chave_pix ? ` — ${c.chave_pix}` : ' (sem chave Pix)'}
                </option>
              ))}
            </select>
          </label>
        </Cartao>
      )}

      {editavel && (
        <Botao
          type="button"
          disabled={pendente || itens.length === 0}
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
            {whatsapp && (
              <Botao
                type="button"
                onClick={() => window.open(whatsapp, '_blank', 'noopener,noreferrer')}
              >
                Abrir no WhatsApp
              </Botao>
            )}
            <Botao
              type="button"
              aparencia={whatsapp ? 'secundario' : 'primario'}
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

      {/* C7: cancelar libera as aulas para uma geração futura — é isso que a
          ação faz de fato, e é o que a gestora precisa entender antes. */}
      {podeCancelar && (
        <div className="border-t border-borda pt-6">
          {!confirmandoCancelamento ? (
            <button
              type="button"
              onClick={() => setConfirmandoCancelamento(true)}
              className="min-h-[44px] text-sm font-medium text-tinta-suave underline-offset-4 hover:text-erro hover:underline"
            >
              Cancelar esta cobrança
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-erro">
                A cobrança fica marcada como Cancelada e as {itens.length}{' '}
                {itens.length === 1 ? 'aula volta' : 'aulas voltam'} a ficar disponível para
                uma cobrança futura. Não dá para desfazer.
              </p>
              <div className="flex flex-wrap gap-3">
                <Botao
                  type="button"
                  disabled={pendente}
                  onClick={() => acao(() => cancelar(cobrancaId))}
                >
                  {pendente ? 'Cancelando…' : 'Sim, cancelar a cobrança'}
                </Botao>
                <Botao
                  type="button"
                  aparencia="secundario"
                  onClick={() => setConfirmandoCancelamento(false)}
                >
                  Voltar
                </Botao>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
