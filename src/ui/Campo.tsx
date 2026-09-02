import { useId, type ReactNode } from 'react'

interface CampoProps {
  etiqueta: string
  /** Explicacao em linguagem comum. Aparece sempre, nao escondida em tooltip. */
  ajuda?: string
  erro?: string
  obrigatorio?: boolean
  /**
   * Para conteudo que NAO e um unico controle — um grupo de botoes, por
   * exemplo. Sem isto, o `<label>` empresta o proprio texto ao primeiro
   * controle de dentro e o leitor de tela anuncia o botao "Dom" como "Dias da
   * semana Em quais dias esta turma tem aula. Seg Ter Qua Qui Sex Sáb".
   */
  grupo?: boolean
  children: ReactNode
}

export function Campo({ etiqueta, ajuda, erro, obrigatorio, grupo, children }: CampoProps) {
  const id = useId()

  const conteudo = (
    <>
      <span id={`${id}-etiqueta`} className="mb-1 block font-medium text-tinta">
        {etiqueta}
        {obrigatorio && (
          <span className="ml-1 text-destaque" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {ajuda && <span className="mb-2 block text-sm text-tinta-suave">{ajuda}</span>}
      {children}
      {erro && (
        <span className="mt-1.5 flex items-start gap-1.5 text-sm text-erro">
          <span aria-hidden="true">•</span>
          {erro}
        </span>
      )}
    </>
  )

  // Um grupo de botoes nao e um controle rotulavel: vira `role="group"`, que
  // recebe o nome pelo aria-labelledby sem contaminar o que esta dentro.
  if (grupo) {
    return (
      <div role="group" aria-labelledby={`${id}-etiqueta`} className="block">
        {conteudo}
      </div>
    )
  }

  return <label className="block">{conteudo}</label>
}

/**
 * A borda do campo usa `borda-campo`, que atinge 3:1 contra o branco — o
 * minimo que a WCAG 1.4.11 pede de componente de interface. A borda decorativa,
 * mais clara, ficaria bonita mas deixaria o campo invisivel para quem tem
 * baixa visao.
 */
export const entradaClasse =
  'w-full min-h-[44px] rounded-campo border border-borda-campo bg-superficie ' +
  'px-4 py-2 text-tinta placeholder:text-tinta-tenue ' +
  'transition-colors duration-150 hover:border-tinta-suave ' +
  'focus:border-destaque focus:outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-destaque'
