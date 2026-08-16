/**
 * Esqueleto de carregamento.
 *
 * Sem ele, clicar num link deixa a tela parada na pagina antiga ate o servidor
 * responder — meio segundo sem retorno nenhum, que a usuaria le como travamento.
 * Com ele, a troca de pagina e imediata e o conteudo chega depois.
 */
function Barra({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div style={style} className={`animate-pulse rounded-md bg-superficie-2 ${className}`} />
}

export function EsqueletoPagina({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <header className="flex flex-col gap-2">
        <Barra className="h-9 w-56" />
        <Barra className="h-4 w-32" />
      </header>

      <div className="flex flex-col gap-3">
        {Array.from({ length: linhas }, (_, i) => (
          <Barra
            key={i}
            className="h-[4.5rem] w-full"
            // Escalona a opacidade: da a sensacao de lista, nao de bloco unico.
            style={{ opacity: 1 - i * 0.12 }}
          />
        ))}
      </div>
    </div>
  )
}

export function EsqueletoFormulario() {
  return (
    <div className="flex max-w-2xl flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <Barra className="h-9 w-48" />
      <div className="flex flex-col gap-5 rounded-cartao border border-borda bg-superficie p-6">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Barra className="h-4 w-28" />
            <Barra className="h-11 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
