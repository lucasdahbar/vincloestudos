'use client'

import { useState } from 'react'
import { Campo, entradaClasse } from '@/ui/Campo'
import { aplicarMascara, cepValido, cnpjValido, cpfValido } from '@/dominio/documentos/formato'
import { buscarCep } from '@/dominio/documentos/cep'
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
  /** Preenche varios campos de uma vez — usado pela busca de CEP. */
  aoPreencher?: (valores: Record<string, unknown>) => void
}

const COM_MASCARA = ['cpf', 'cnpj', 'telefone', 'cep']

const PLACEHOLDER: Record<string, string | undefined> = {
  dinheiro: '0,00',
  percentual: '60',
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  telefone: '(00) 00000-0000',
  cep: '00000-000',
}

/** Validacao imediata do documento, mostrada ao sair do campo (Secao 5.3). */
function erroDeDocumento(tipo: string, valor: string): string | null {
  if (!valor.trim()) return null
  if (tipo === 'cpf' && !cpfValido(valor)) return 'CPF inválido'
  if (tipo === 'cnpj' && !cnpjValido(valor)) return 'CNPJ inválido'
  if (tipo === 'cep' && !cepValido(valor)) return 'CEP incompleto'
  return null
}

export function CampoDinamico({
  campo,
  valor,
  erro,
  referencias,
  aoMudar,
  aoPreencher,
}: Props) {
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

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
          type={campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'text'}
          inputMode={
            campo.tipo === 'dinheiro' || campo.tipo === 'percentual'
              ? 'decimal'
              : COM_MASCARA.includes(campo.tipo)
                ? 'numeric'
                : undefined
          }
          placeholder={PLACEHOLDER[campo.tipo]}
          value={String(valor ?? '')}
          onChange={(e) => {
            setErroLocal(null)
            const bruto = e.target.value
            // A mascara e aplicada A CADA TECLA, nao so na validacao do envio:
            // e o que faz a gestora ver que digitou errado antes de salvar.
            const tratado = COM_MASCARA.includes(campo.tipo)
              ? aplicarMascara(campo.tipo, bruto)
              : campo.tipo === 'numero'
                ? bruto === ''
                  ? null
                  : Number(bruto)
                : bruto
            aoMudar(campo.nome, tratado)
          }}
          onBlur={async (e) => {
            const texto = e.target.value
            setErroLocal(erroDeDocumento(campo.tipo, texto))

            // CEP preenche o resto do endereco ao sair do campo (Secao 5.2).
            if (campo.tipo !== 'cep' || !aoPreencher || !cepValido(texto)) return

            setBuscando(true)
            const r = await buscarCep(texto)
            setBuscando(false)

            if (r.ok) aoPreencher({ ...r.endereco })
            else setErroLocal(r.motivo)
          }}
          className={entradaClasse}
        />
      )}

      {buscando && (
        <span className="mt-1 block text-sm text-tinta-suave">Buscando endereço…</span>
      )}
      {erroLocal && !erro && (
        <span className="mt-1.5 block text-sm text-erro">{erroLocal}</span>
      )}
    </Campo>
  )
}
