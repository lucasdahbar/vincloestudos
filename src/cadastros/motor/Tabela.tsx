'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { formatarCelula } from './formatar'
import { Selo } from '@/ui/Selo'
import { containerEscalonado, itemEscalonado } from '@/ui/animacoes'
import type { CadastroCliente } from '@/cadastros/tipos'
import type { Registro } from '@/dados/crud'

/**
 * Tabela no desktop, cartoes no celular.
 *
 * Uma tabela de 36rem dentro de uma tela de 375px rola de lado: para ler uma
 * linha inteira e preciso arrastar a tabela horizontalmente, e a coluna que
 * identifica o registro sai da tela. No celular cada registro vira um cartao,
 * com o primeiro campo como titulo e os demais como pares rotulo/valor.
 */
export function Tabela({
  definicao,
  registros,
}: {
  definicao: CadastroCliente
  registros: Registro[]
}) {
  const temAtivo = definicao.campos.some((c) => c.nome === 'ativo')
  const colunas = definicao.camposDaLista.filter((c) => c.nome !== 'ativo')
  const [principal, ...secundarias] = colunas

  return (
    <>
      {/* Celular */}
      <motion.ul
        variants={containerEscalonado}
        initial="oculto"
        animate="visivel"
        className="flex flex-col gap-3 sm:hidden"
      >
        {registros.map((registro) => (
          <motion.li key={registro.id} variants={itemEscalonado}>
            <Link
              href={`/cadastros/${definicao.rota}/${registro.id}`}
              className="block rounded-cartao border border-borda bg-superficie p-4 shadow-sutil transition-colors active:bg-superficie-2"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium leading-snug">
                  {principal
                    ? formatarCelula(principal, registro[principal.nome], registro)
                    : `#${registro.id}`}
                </span>
                {temAtivo && !registro.ativo && <Selo tom="encerrado">Inativo</Selo>}
              </div>

              {secundarias.length > 0 && (
                <dl className="mt-2 flex flex-col gap-1 text-sm">
                  {secundarias.map((campo) => {
                    const valor = formatarCelula(campo, registro[campo.nome], registro)
                    if (valor === '—') return null
                    return (
                      <div key={campo.nome} className="flex justify-between gap-3">
                        <dt className="shrink-0 text-tinta-tenue">{campo.etiqueta}</dt>
                        <dd className="text-right">{valor}</dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </Link>
          </motion.li>
        ))}
      </motion.ul>

      {/* Desktop */}
      <div className="hidden overflow-x-auto rounded-cartao border border-borda bg-superficie shadow-sutil sm:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-borda bg-superficie-2/60">
              {colunas.map((campo) => (
                <th key={campo.nome} className="px-5 py-3 text-sm font-semibold text-tinta-suave">
                  {campo.etiqueta}
                </th>
              ))}
              {temAtivo && (
                <th className="px-5 py-3 text-sm font-semibold text-tinta-suave">Situação</th>
              )}
              <th className="px-5 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <motion.tbody variants={containerEscalonado} initial="oculto" animate="visivel">
            {registros.map((registro) => (
              <motion.tr
                key={registro.id}
                variants={itemEscalonado}
                className="border-b border-borda/60 transition-colors last:border-0 hover:bg-superficie-2/40"
              >
                {colunas.map((campo) => (
                  <td key={campo.nome} className="px-5 py-4">
                    {formatarCelula(campo, registro[campo.nome], registro)}
                  </td>
                ))}
                {temAtivo && (
                  <td className="px-5 py-4">
                    <Selo tom={registro.ativo ? 'ativo' : 'encerrado'}>
                      {registro.ativo ? 'Ativo' : 'Inativo'}
                    </Selo>
                  </td>
                )}
                <td className="px-5 py-4 text-right">
                  <Link
                    href={`/cadastros/${definicao.rota}/${registro.id}`}
                    className="font-medium text-destaque hover:text-destaque-forte hover:underline"
                  >
                    Editar
                  </Link>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </>
  )
}
