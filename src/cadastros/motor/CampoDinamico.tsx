'use client'

import { Campo, entradaClasse } from '@/ui/Campo'
import type { CampoCliente } from '@/cadastros/tipos'

export interface OpcaoReferencia {
  id: number
  rotulo: string
}

interface Props {
  campo: CampoCliente
  valor: unknown
  erro?: string
  referencias: Record<string, OpcaoReferencia[]>
  aoMudar: (nome: string, valor: unknown) => void
}

export function CampoDinamico({ campo, valor, erro, referencias, aoMudar }: Props) {
  if (campo.tipo === 'booleano') {
    return (
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(e) => aoMudar(campo.nome, e.target.checked)}
          className="size-5 accent-destaque"
        />
        <span>
          <span className="font-medium">{campo.etiqueta}</span>
          {campo.ajuda && <span className="block text-sm text-tinta-suave">{campo.ajuda}</span>}
        </span>
      </label>
    )
  }

  return (
    <Campo
      etiqueta={campo.etiqueta}
      ajuda={campo.ajuda}
      erro={erro}
      obrigatorio={campo.obrigatorio}
    >
      {campo.tipo === 'texto-longo' ? (
        <textarea
          rows={3}
          value={String(valor ?? '')}
          onChange={(e) => aoMudar(campo.nome, e.target.value)}
          className={entradaClasse}
        />
      ) : campo.tipo === 'selecao' ? (
        <select
          value={String(valor ?? '')}
          onChange={(e) => aoMudar(campo.nome, e.target.value)}
          className={entradaClasse}
        >
          <option value="">Selecione…</option>
          {campo.opcoes?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : campo.tipo === 'referencia' ? (
        <select
          value={valor === null || valor === undefined ? '' : String(valor)}
          onChange={(e) =>
            aoMudar(campo.nome, e.target.value === '' ? null : Number(e.target.value))
          }
          className={entradaClasse}
        >
          <option value="">Selecione…</option>
          {(referencias[campo.nome] ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={
            campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'text'
          }
          inputMode={
            campo.tipo === 'dinheiro' || campo.tipo === 'percentual' ? 'decimal' : undefined
          }
          placeholder={
            campo.tipo === 'dinheiro' ? '0,00' : campo.tipo === 'percentual' ? '60' : undefined
          }
          value={String(valor ?? '')}
          onChange={(e) =>
            aoMudar(
              campo.nome,
              campo.tipo === 'numero'
                ? e.target.value === ''
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
          className={entradaClasse}
        />
      )}
    </Campo>
  )
}
