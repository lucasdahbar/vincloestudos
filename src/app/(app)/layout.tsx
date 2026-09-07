import { exigirSessao } from '@/dados/sessao'
import { sair } from '@/app/login/acoes'
import { Botao } from '@/ui/Botao'
import { NavLateral } from '@/ui/NavLateral'
import { NavMobile } from '@/ui/NavMobile'
import { PRIMEIRA, SEGUNDA } from '@/marca'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao()
  const iniciais = sessao.nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    /* Coluna no celular (topo acima do conteudo) e linha no desktop
       (lateral ao lado do conteudo). */
    <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col md:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-borda bg-superficie-2/50 md:flex">
        <div className="px-6 py-7">
          <p className="font-titulo text-xl leading-[1.15] tracking-[-0.02em]">
            {PRIMEIRA}
            <br />
            <span className="text-destaque">{SEGUNDA}</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <NavLateral papel={sessao.papel} />
        </div>

        <div className="border-t border-borda p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-destaque-suave text-sm font-semibold text-destaque-forte"
            >
              {iniciais}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{sessao.nome}</span>
              <span className="block text-xs capitalize text-tinta-tenue">{sessao.papel}</span>
            </span>
          </div>
          <form action={sair}>
            <Botao aparencia="discreto" className="w-full justify-start px-3 text-sm">
              Sair
            </Botao>
          </form>
        </div>
      </aside>


      <NavMobile papel={sessao.papel} nome={sessao.nome} />

      <main className="min-w-0 flex-1 px-5 pb-28 pt-6 md:px-10 md:py-9 md:pb-12">
        {children}
      </main>

    </div>
  )
}
