import { exigirSessao } from '@/dados/sessao'
import { sair } from '@/app/login/acoes'
import { Botao } from '@/ui/Botao'
import { NavLateral } from '@/ui/NavLateral'
import { NavMobile } from '@/ui/NavMobile'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao()
  const iniciais = sessao.nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1440px]">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-borda bg-superficie-2/50 md:flex">
        <div className="px-6 py-7">
          <p className="font-titulo text-xl leading-[1.15] tracking-[-0.02em]">
            Mesinha
            <br />
            <span className="text-destaque">Redonda</span>
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

      {/* Cabecalho do celular: a lateral fica escondida abaixo de md. */}
      <header className="fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-borda bg-fundo px-5 py-3 md:hidden">
        <p className="font-titulo text-lg tracking-[-0.02em]">
          Mesinha <span className="text-destaque">Redonda</span>
        </p>
        <form action={sair}>
          <button className="min-h-[40px] rounded-campo px-3 text-sm text-tinta-suave">
            Sair
          </button>
        </form>
      </header>

      <main className="min-w-0 flex-1 px-5 pb-24 pt-20 md:px-10 md:py-9 md:pb-12">
        {children}
      </main>

      <NavMobile papel={sessao.papel} nome={sessao.nome} />
    </div>
  )
}
