'use client'

import Link from 'next/link'
import { motion } from 'motion/react'
import { formatarCelula } from './formatar'
import { Selo } from '@/ui/Selo'
import { containerEscalonado, itemEscalonado } from '@/ui/animacoes'
import type { CadastroCliente } from '@/cadastros/tipos'
import type { Registro } from '@/dados/crud'

export function Tabela({
  definicao,
  registros,
}: {
  definicao: CadastroCliente
  registros: Registro[]
}) {
  const temAtivo = definicao.campos.some((c) => c.nome === 'ativo')
  const colunas = definicao.camposDaLista.filter((c) => c.nome !== 'ativo')

  return (
    <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-borda bg-superficie-2/60">
            {colunas.map((campo) => (
              <th key={campo.nome} className="px-5 py-3 text-sm font-semibold text-tinta-suave">
                {campo.etiqueta}
              </th>
            ))}
            {temAtivo && <th className="px-5 py-3 text-sm font-semibold text-tinta-suave">Situação</th>}
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
  )
}
