'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Papel } from '@/dominio/tipos'
import { ehAtivo, visiveisPara } from './navegacao'

/**
 * Navegacao do celular, em tres camadas de propósito redundante.
 *
 * 1. Barra do topo, `sticky`. Fica no fluxo do documento, entao aparece mesmo
 *    que `position: fixed` falhe — e ja falhou uma vez aqui, quando um texto
 *    sem quebra fez o navegador encolher a pagina e jogar a barra de baixo
 *    para fora da tela. Esta e a garantia: se tudo mais der errado, o botao
 *    "Menu" continua no topo da pagina.
 * 2. Gaveta com a lista completa, aberta pelo topo ou pela barra de baixo.
 * 3. Barra de baixo, `fixed`, com os destinos frequentes ao alcance do polegar.
 */
export function NavMobile({ papel, nome }: { papel: Papel; nome: string }) {
  const caminho = usePathname()
  const [aberto, setAberto] = useState(false)
  const secoes = visiveisPara(papel)
  const principais = secoes.flatMap((s) => s.itens).filter((i) => i.principal)

  useEffect(() => setAberto(false), [caminho])
  useEffect(() => {
    document.body.style.overflow = aberto ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [aberto])

  const rotuloAtual =
    secoes.flatMap((s) => s.itens).find((i) => ehAtivo(i.href, caminho))?.rotulo ?? 'Menu'

  return (
    <>
      {/* 1. Topo em fluxo: nao depende de fixed. */}
      <header className="sticky top-0 z-20 border-b border-borda bg-fundo md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setAberto(true)}
            aria-expanded={aberto}
            aria-controls="menu-completo"
            className="flex min-h-[44px] items-center gap-2.5 rounded-campo border border-borda bg-superficie px-3 font-medium shadow-sutil active:bg-superficie-2"
          >
            <span aria-hidden="true" className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 rounded-full bg-tinta" />
              <span className="block h-[2px] w-4 rounded-full bg-tinta" />
              <span className="block h-[2px] w-4 rounded-full bg-tinta" />
            </span>
            <span className="max-w-[9rem] truncate text-[0.9375rem]">{rotuloAtual}</span>
          </button>

          <p className="font-titulo text-base tracking-[-0.02em]">
            Mesinha <span className="text-destaque">Redonda</span>
          </p>
        </div>
      </header>

      {/* 2. Gaveta com todos os destinos. */}
      <AnimatePresence>
        {aberto && (
          <>
            <motion.button
              type="button"
              aria-label="Fechar menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAberto(false)}
              className="fixed inset-0 z-40 bg-tinta/30 md:hidden"
            />
            <motion.div
              id="menu-completo"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 38 }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-painel border-t border-borda bg-superficie pb-[calc(env(safe-area-inset-bottom)+1rem)] md:hidden"
            >
              <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-borda bg-superficie px-5 py-4">
                <span className="font-titulo text-lg">{nome}</span>
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="min-h-[44px] rounded-campo px-4 font-medium text-tinta-suave"
                >
                  Fechar
                </button>
              </div>

              <div className="flex flex-col gap-6 px-5 py-5">
                {secoes.map((secao) => (
                  <div key={secao.titulo}>
                    <h2 className="rotulo-seco mb-2">{secao.titulo}</h2>
                    <ul className="grid grid-cols-2 gap-2">
                      {secao.itens.map((item) => (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={ehAtivo(item.href, caminho) ? 'page' : undefined}
                            className={`flex min-h-[52px] items-center rounded-campo border px-4 text-[0.9375rem] transition-colors ${
                              ehAtivo(item.href, caminho)
                                ? 'border-destaque-borda bg-destaque-suave font-semibold text-destaque-forte'
                                : 'border-borda bg-superficie text-tinta'
                            }`}
                          >
                            {item.rotulo}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 3. Barra de baixo: atalho para o polegar. */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-superficie pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgb(74_57_44/0.06)] md:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {principais.map((item) => {
            const ativo = ehAtivo(item.href, caminho)
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={ativo ? 'page' : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 text-xs transition-colors ${
                    ativo ? 'font-semibold text-destaque-forte' : 'text-tinta-suave'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-[3px] w-6 rounded-full transition-colors ${
                      ativo ? 'bg-destaque' : 'bg-transparent'
                    }`}
                  />
                  {item.rotulo}
                </Link>
              </li>
            )
          })}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => setAberto(true)}
              aria-expanded={aberto}
              aria-controls="menu-completo"
              className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 text-xs text-tinta-suave"
            >
              <span aria-hidden="true" className="h-[3px] w-6 rounded-full bg-transparent" />
              Menu
            </button>
          </li>
        </ul>
      </nav>
    </>
  )
}
