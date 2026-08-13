import type { ReactNode } from 'react'

/**
 * Tabela vazia nao diz o que fazer. Este componente sempre nomeia o proximo passo:
 * e a diferenca entre a usuaria travar e a usuaria seguir sozinha.
 */
export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string
  descricao: string
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-cartao border border-dashed border-borda bg-superficie-2/50 px-6 py-16 text-center">
      <h3 className="text-xl">{titulo}</h3>
      <p className="max-w-md text-tinta-suave">{descricao}</p>
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}
