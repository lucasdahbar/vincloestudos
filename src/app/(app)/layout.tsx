import { exigirSessao } from '@/dados/sessao'
import { NavLateral } from '@/ui/NavLateral'
import { sair } from '@/app/login/acoes'
import { Botao } from '@/ui/Botao'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao()

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px]">
      <aside className="hidden w-64 shrink-0 border-r border-borda bg-superficie-2/40 md:flex md:flex-col">
        <div className="px-7 py-6">
          <p className="font-titulo text-xl leading-tight">
            Mesinha
            <br />
            Redonda
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLateral papel={sessao.papel} />
        </div>
        <div className="border-t border-borda p-4">
          <p className="px-3 pb-2 text-sm text-tinta-suave">{sessao.nome}</p>
          <form action={sair}>
            <Botao aparencia="discreto" className="w-full justify-start px-3">
              Sair
            </Botao>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  )
}
