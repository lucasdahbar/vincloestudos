'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { entradaClasse } from './Campo'

export interface Seletor {
  /** Nome do parâmetro na URL. */
  campo: string
  rotulo: string
  opcoes: { valor: string; nome: string }[]
  /** Texto da opção sem filtro. */
  todos?: string
}

/**
 * Filtros de listagem (T2, generalizado para agenda e matrículas).
 *
 * O estado mora na URL, nao no componente: assim a gestora pode voltar pelo
 * botao do navegador, recarregar sem perder o filtro e mandar o link de uma
 * busca para outra pessoa. O servidor e que filtra — filtrar no cliente
 * exigiria baixar tudo para esconder a maioria.
 *
 * So mexe nos proprios campos: o resto da URL (a semana que a agenda mostra,
 * por exemplo) sobrevive a filtrar e a limpar.
 */
export function Filtros({
  seletores,
  busca,
  total,
  contagem,
}: {
  seletores: Seletor[]
  busca?: { campo: string; rotulo: string; placeholder: string }
  total: number
  contagem: { um: string; varios: string; nenhum: string }
}) {
  const router = useRouter()
  const caminho = usePathname()
  const parametros = useSearchParams()
  const [pendente, iniciar] = useTransition()

  const campos = [...seletores.map((s) => s.campo), ...(busca ? [busca.campo] : [])]
  const algumFiltro = campos.some((c) => parametros.get(c))

  function aplicar(mudar: (novos: URLSearchParams) => void) {
    const novos = new URLSearchParams(parametros.toString())
    mudar(novos)
    iniciar(() => {
      router.replace(novos.size ? `${caminho}?${novos}` : caminho, { scroll: false })
    })
  }

  function filtrar(campo: string, valor: string) {
    aplicar((novos) => (valor ? novos.set(campo, valor) : novos.delete(campo)))
  }

  // A busca espera a pessoa parar de digitar: uma ida ao servidor por letra
  // deixaria a lista piscando.
  const [termo, setTermo] = useState(busca ? (parametros.get(busca.campo) ?? '') : '')
  const ultimoTermo = useRef(termo)

  useEffect(() => {
    if (!busca || termo === ultimoTermo.current) return
    const timer = setTimeout(() => {
      ultimoTermo.current = termo
      filtrar(busca.campo, termo.trim())
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo])

  function limpar() {
    setTermo('')
    ultimoTermo.current = ''
    aplicar((novos) => campos.forEach((c) => novos.delete(c)))
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-cartao border border-borda bg-superficie p-4"
      aria-busy={pendente}
    >
      <div className="flex flex-wrap items-end gap-3">
        {busca && (
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:max-w-xs">
            <span className="text-xs font-medium text-tinta-suave">{busca.rotulo}</span>
            <input
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder={busca.placeholder}
              className={entradaClasse}
            />
          </label>
        )}

        {seletores
          .filter((s) => s.opcoes.length > 0)
          .map((s) => (
            <label key={s.campo} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-tinta-suave">{s.rotulo}</span>
              <select
                value={parametros.get(s.campo) ?? ''}
                onChange={(e) => filtrar(s.campo, e.target.value)}
                className={`${entradaClasse} min-w-[9rem]`}
              >
                <option value="">{s.todos ?? 'Todos'}</option>
                {s.opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          ))}

        {algumFiltro && (
          <button
            type="button"
            onClick={limpar}
            className="min-h-[44px] rounded-campo px-3 text-sm font-medium text-destaque underline-offset-4 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {algumFiltro && (
        <p className="text-sm text-tinta-suave" aria-live="polite">
          {total === 0
            ? contagem.nenhum
            : `${total} ${total === 1 ? contagem.um : contagem.varios}.`}
        </p>
      )}
    </div>
  )
}

/** Lista de cadastro (id, nome) no formato de opção do seletor. */
export function deOpcoes(lista: { id: number; nome: string }[]) {
  return lista.map((o) => ({ valor: String(o.id), nome: o.nome }))
}

/** Lista de valores fixos (enum) no formato de opção do seletor. */
export function deValores(lista: readonly string[]) {
  return lista.map((v) => ({ valor: v, nome: v }))
}
