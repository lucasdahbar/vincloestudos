'use client'

import { useMemo, useState } from 'react'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'

interface Item {
  id: number
  aluno_nome: string
  descricao: string
  valor_original: number
}

/**
 * C3 (Rodada 2): aplica o mesmo desconto a todas as aulas de um grupo.
 *
 * O grupo e (aluno + servico), que e como o desconto costuma ser negociado —
 * "as aulas de matematica do João saem por menos". A descricao do item comeca
 * pelo servico, entao ela e a chave natural do agrupamento.
 *
 * Isto e so conveniencia de interface: o desconto continua gravado item a item
 * e segue editavel um por um depois.
 */
export function DescontoEmLote({
  itens,
  pendente,
  aplicar,
}: {
  itens: Item[]
  pendente: boolean
  aplicar: (itemIds: number[], valorTexto: string) => void
}) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, Item[]>()
    for (const i of itens) {
      const chave = `${i.aluno_nome}|${i.descricao}`
      mapa.set(chave, [...(mapa.get(chave) ?? []), i])
    }
    // Grupo de uma aula só não precisa de atalho: o campo da linha já resolve.
    return [...mapa.entries()].filter(([, doGrupo]) => doGrupo.length > 1)
  }, [itens])

  const [grupo, setGrupo] = useState('')
  const [valor, setValor] = useState('')

  if (grupos.length === 0) return null

  const selecionado = grupos.find(([chave]) => chave === grupo)?.[1] ?? []

  return (
    <Cartao className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg">Aplicar desconto a várias aulas</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Preenche o mesmo desconto em todas as aulas do grupo de uma vez. Depois você ainda
          pode ajustar uma aula específica na tabela.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-tinta-suave">Grupo</span>
          <select
            value={grupo}
            onChange={(e) => setGrupo(e.target.value)}
            className={`${entradaClasse} min-w-[16rem]`}
          >
            <option value="">Selecione…</option>
            {grupos.map(([chave, doGrupo]) => {
              const [aluno, descricao] = chave.split('|')
              return (
                <option key={chave} value={chave}>
                  {aluno} · {descricao} ({doGrupo.length} aulas)
                </option>
              )
            })}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-tinta-suave">Desconto por aula</span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            placeholder="0,00"
            onChange={(e) => setValor(e.target.value)}
            className={`${entradaClasse} max-w-[9rem]`}
          />
        </label>

        <Botao
          type="button"
          disabled={pendente || selecionado.length === 0 || valor.trim() === ''}
          onClick={() => aplicar(selecionado.map((i) => i.id), valor)}
        >
          {pendente ? 'Aplicando…' : 'Aplicar'}
        </Botao>
      </div>

      {selecionado.length > 0 && (
        <p className="text-sm text-tinta-suave" aria-live="polite">
          {selecionado.length} aulas de {formatarBRL(selecionado[0].valor_original)} cada.
        </p>
      )}
    </Cartao>
  )
}
