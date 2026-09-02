'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { pagar } from '../acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'
import { formatarBRL } from '@/dominio/dinheiro'
import { ORIGENS_BAIXA, type OrigemBaixa } from '@/dominio/tipos'

const FORMAS = ['Pix', 'Dinheiro', 'Transferência', 'Cartão', 'Outros'] as const

interface Opcao {
  id: number
  nome: string
}

/**
 * P3 e P4 (Rodada 2): dar baixa numa conta a pagar.
 *
 * O valor vem preenchido com o saldo, que e o caso comum — pagar tudo de uma
 * vez. O parcial existe para quem precisa, sem cobrar trabalho de quem nao.
 *
 * A origem decide o proximo campo: conta da empresa OU responsavel que pagou
 * direto. Os dois nunca aparecem juntos, porque um pagamento nao pode ter saido
 * dos dois lugares.
 */
export function FormularioBaixa({
  contaId,
  saldo,
  contas,
  responsaveis,
}: {
  contaId: number
  saldo: number
  contas: Opcao[]
  responsaveis: Opcao[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])
  const [aberto, setAberto] = useState(false)

  const hoje = new Date()
  const dataDeHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  const [estado, setEstado] = useState({
    valorTexto: (saldo / 100).toFixed(2).replace('.', ','),
    data: dataDeHoje,
    origem: 'Conta própria' as OrigemBaixa,
    conta_id: (contas[0]?.id ?? null) as number | null,
    responsavel_id: null as number | null,
    forma_pagamento: 'Pix' as string | null,
    observacao: '' as string | null,
  })

  /**
   * Reabrir depois de uma baixa parcial tem de mostrar o saldo NOVO. O
   * componente nao e desmontado ao fechar, entao sem este reset o campo
   * continuaria com o valor da baixa anterior — e a gestora pagaria de novo o
   * mesmo valor sem perceber.
   */
  function abrir() {
    setEstado((a) => ({ ...a, valorTexto: (saldo / 100).toFixed(2).replace('.', ',') }))
    setErros([])
    setAberto(true)
  }

  if (!aberto) {
    return (
      <Botao type="button" onClick={abrir}>
        Dar baixa no pagamento
      </Botao>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      <Cartao className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg">Registrar pagamento</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Em aberto: {formatarBRL(saldo)}. Você pode pagar tudo ou uma parte.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Valor pago" obrigatorio>
            <input
              type="text"
              inputMode="decimal"
              value={estado.valorTexto}
              onChange={(e) => setEstado((a) => ({ ...a, valorTexto: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
          <Campo etiqueta="Data" obrigatorio>
            <input
              type="date"
              value={estado.data}
              onChange={(e) => setEstado((a) => ({ ...a, data: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
        </div>

        <Campo
          etiqueta="De onde saiu o dinheiro"
          ajuda="Se o responsável pagou o professor direto, registre aqui — o valor não passa pela conta da empresa."
          obrigatorio
        >
          <select
            value={estado.origem}
            onChange={(e) => setEstado((a) => ({ ...a, origem: e.target.value as OrigemBaixa }))}
            className={entradaClasse}
          >
            {ORIGENS_BAIXA.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Campo>

        {/* P4: os dois campos são mutuamente exclusivos. */}
        {estado.origem === 'Conta própria' && (
          <Campo etiqueta="Conta" obrigatorio>
            <select
              value={estado.conta_id ?? ''}
              onChange={(e) =>
                setEstado((a) => ({
                  ...a,
                  conta_id: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className={entradaClasse}
            >
              <option value="">Selecione…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {estado.origem === 'Pago por responsável' && (
          <Campo etiqueta="Responsável que pagou" obrigatorio>
            <select
              value={estado.responsavel_id ?? ''}
              onChange={(e) =>
                setEstado((a) => ({
                  ...a,
                  responsavel_id: e.target.value ? Number(e.target.value) : null,
                }))
              }
              className={entradaClasse}
            >
              <option value="">Selecione…</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo etiqueta="Forma de pagamento">
          <select
            value={estado.forma_pagamento ?? ''}
            onChange={(e) => setEstado((a) => ({ ...a, forma_pagamento: e.target.value || null }))}
            className={entradaClasse}
          >
            <option value="">Não informar</option>
            {FORMAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Observação">
          <textarea
            rows={2}
            value={estado.observacao ?? ''}
            onChange={(e) => setEstado((a) => ({ ...a, observacao: e.target.value || null }))}
            className={entradaClasse}
          />
        </Campo>

        {erros.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-erro">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-3">
          <Botao
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                setErros([])
                const r = await pagar(contaId, estado)
                if (r.ok) {
                  setAberto(false)
                  router.refresh()
                } else {
                  setErros(r.erros ?? ['Não foi possível registrar o pagamento.'])
                }
              })
            }
          >
            {pendente ? 'Registrando…' : 'Registrar pagamento'}
          </Botao>
          <Botao type="button" aparencia="secundario" onClick={() => setAberto(false)}>
            Cancelar
          </Botao>
        </div>
      </Cartao>
    </motion.div>
  )
}
