'use client'

import { useState } from 'react'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'

/**
 * A mensagem do link da aula online, à vista na página da aula (pedido de
 * 01/11/2026). O envio aluno por aluno continua na lista; aqui a gestora vê o
 * texto e pode copiar para mandar por outro caminho.
 */
export function MensagemDoLink({ texto, aluno }: { texto: string; aluno: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <Cartao>
      <h2 className="text-lg">Mensagem do link</h2>
      <p className="mt-1 text-sm text-tinta-suave">Como sai para {aluno}. Cada aluno recebe com o próprio nome.</p>
      <p className="mt-3 whitespace-pre-line rounded-campo bg-superficie-2 px-4 py-3 text-sm">{texto}</p>
      <div className="mt-3">
        <Botao type="button" aparencia="secundario" onClick={copiar}>
          {copiado ? 'Copiada' : 'Copiar mensagem'}
        </Botao>
      </div>
    </Cartao>
  )
}
