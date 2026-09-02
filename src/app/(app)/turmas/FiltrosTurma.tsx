'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { MODALIDADES, STATUS_TURMA } from '@/dominio/tipos'
import { entradaClasse } from '@/ui/Campo'

interface Opcao {
  id: number
  nome: string
}

/**
 * T2 (Rodada 2): filtros da listagem de turmas.
 *
 * O estado mora na URL, nao no componente: assim a gestora pode voltar pelo
 * botao do navegador, recarregar sem perder o filtro e mandar o link de uma
 * busca para outra pessoa. O servidor e que filtra — filtrar no cliente
 * exigiria baixar todas as turmas para esconder a maioria.
 */
export function FiltrosTurma({
  materias,
  escolas,
  professores,
  total,
}: {
  materias: Opcao[]
  escolas: Opcao[]
  professores: Opcao[]
  total: number
}) {
  const router = useRouter()
  const caminho = usePathname()
  const parametros = useSearchParams()
  const [pendente, iniciar] = useTransition()

  function filtrar(campo: string, valor: string) {
    const novos = new URLSearchParams(parametros.toString())
    if (valor) novos.set(campo, valor)
    else novos.delete(campo)

    iniciar(() => {
      router.replace(novos.size ? `${caminho}?${novos}` : caminho, { scroll: false })
    })
  }

  const algumFiltro = [...parametros.keys()].length > 0

  const seletor = (campo: string, rotulo: string, opcoes: { valor: string; nome: string }[]) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-tinta-suave">{rotulo}</span>
      <select
        value={parametros.get(campo) ?? ''}
        onChange={(e) => filtrar(campo, e.target.value)}
        className={`${entradaClasse} min-w-[9rem]`}
      >
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nome}
          </option>
        ))}
      </select>
    </label>
  )

  const deOpcoes = (lista: Opcao[]) =>
    lista.map((o) => ({ valor: String(o.id), nome: o.nome }))

  return (
    <div
      className="flex flex-col gap-3 rounded-cartao border border-borda bg-superficie p-4"
      aria-busy={pendente}
    >
      <div className="flex flex-wrap items-end gap-3">
        {seletor('status', 'Situação', STATUS_TURMA.map((s) => ({ valor: s, nome: s })))}
        {materias.length > 0 && seletor('materia', 'Matéria', deOpcoes(materias))}
        {escolas.length > 0 && seletor('escola', 'Escola', deOpcoes(escolas))}
        {professores.length > 0 && seletor('professor', 'Professor', deOpcoes(professores))}
        {seletor('modalidade', 'Modalidade', MODALIDADES.map((m) => ({ valor: m, nome: m })))}

        {algumFiltro && (
          <button
            type="button"
            onClick={() => iniciar(() => router.replace(caminho, { scroll: false }))}
            className="min-h-[44px] rounded-campo px-3 text-sm font-medium text-destaque underline-offset-4 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {algumFiltro && (
        <p className="text-sm text-tinta-suave" aria-live="polite">
          {total === 0
            ? 'Nenhuma turma com esses filtros.'
            : `${total} ${total === 1 ? 'turma encontrada' : 'turmas encontradas'}.`}
        </p>
      )}
    </div>
  )
}
