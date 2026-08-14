'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import type { Papel } from '@/dominio/tipos'
import { ehAtivo, visiveisPara } from './navegacao'

export function NavLateral({ papel }: { papel: Papel }) {
  const caminho = usePathname()
  const secoes = visiveisPara(papel)

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-7 px-3 py-2">
      {secoes.map((secao) => (
        <div key={secao.titulo}>
          <h2 className="rotulo-seco mb-2 px-3">{secao.titulo}</h2>
          <ul className="flex flex-col gap-0.5">
            {secao.itens.map((item) => {
              const ativo = ehAtivo(item.href, caminho)
              return (
                <li key={item.href} className="relative">
                  {ativo && (
                    /* O realce desliza entre itens em vez de piscar: e a
                       animacao que mais comunica "voce esta aqui". */
                    <motion.span
                      layoutId="nav-ativo"
                      className="absolute inset-0 rounded-campo bg-superficie shadow-sutil"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <Link
                    href={item.href}
                    aria-current={ativo ? 'page' : undefined}
                    className={`relative flex min-h-[42px] items-center gap-2.5 rounded-campo px-3 text-[0.9375rem] transition-colors ${
                      ativo
                        ? 'font-semibold text-destaque-forte'
                        : 'text-tinta-suave hover:text-tinta'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-4 w-[3px] shrink-0 rounded-full transition-colors ${
                        ativo ? 'bg-destaque' : 'bg-transparent'
                      }`}
                    />
                    {item.rotulo}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
