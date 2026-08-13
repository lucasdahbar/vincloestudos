'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import type { Papel } from '@/dominio/tipos'

interface Secao {
  titulo: string
  itens: { rotulo: string; href: string; papeis?: Papel[] }[]
}

const SECOES: Secao[] = [
  {
    titulo: 'Dia a dia',
    itens: [
      { rotulo: 'Início', href: '/' },
      { rotulo: 'Turmas', href: '/turmas' },
      { rotulo: 'Matrículas', href: '/matriculas', papeis: ['gestora'] },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { rotulo: 'Responsáveis', href: '/cadastros/responsaveis', papeis: ['gestora'] },
      { rotulo: 'Alunos', href: '/cadastros/alunos', papeis: ['gestora'] },
      { rotulo: 'Professores', href: '/cadastros/professores', papeis: ['gestora'] },
      { rotulo: 'Escolas', href: '/cadastros/escolas', papeis: ['gestora'] },
      { rotulo: 'Serviços', href: '/cadastros/servicos', papeis: ['gestora'] },
      { rotulo: 'Matérias', href: '/cadastros/materias', papeis: ['gestora'] },
      { rotulo: 'Anos escolares', href: '/cadastros/anos-escolares', papeis: ['gestora'] },
      { rotulo: 'Cidades', href: '/cadastros/cidades', papeis: ['gestora'] },
      { rotulo: 'Contas', href: '/cadastros/contas', papeis: ['gestora'] },
      { rotulo: 'Feriados', href: '/cadastros/feriados', papeis: ['gestora'] },
    ],
  },
]

export function NavLateral({ papel }: { papel: Papel }) {
  const caminho = usePathname()

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6 p-4">
      {SECOES.map((secao) => {
        const visiveis = secao.itens.filter((i) => !i.papeis || i.papeis.includes(papel))
        if (visiveis.length === 0) return null

        return (
          <div key={secao.titulo}>
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-tinta-suave">
              {secao.titulo}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {visiveis.map((item) => {
                const ativo =
                  item.href === '/' ? caminho === '/' : caminho.startsWith(item.href)
                return (
                  <li key={item.href} className="relative">
                    {ativo && (
                      <motion.span
                        layoutId="nav-ativo"
                        className="absolute inset-0 rounded-campo bg-destaque-suave"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Link
                      href={item.href}
                      aria-current={ativo ? 'page' : undefined}
                      className={`relative flex min-h-[44px] items-center rounded-campo px-3 transition-colors ${
                        ativo ? 'font-medium text-destaque-forte' : 'text-tinta-suave hover:text-tinta'
                      }`}
                    >
                      {item.rotulo}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
