type Tom = 'ativo' | 'encerrado' | 'alerta' | 'neutro'

/**
 * Selo com borda propria. Cor de fundo sozinha nao basta: em tela com pouco
 * contraste ou impressa em preto e branco, a borda mantem o estado legivel.
 */
const TONS: Record<Tom, string> = {
  ativo: 'bg-apoio-suave text-apoio border-apoio-borda',
  encerrado: 'bg-superficie-2 text-tinta-suave border-borda',
  alerta: 'bg-alerta-suave text-alerta border-alerta-borda',
  neutro: 'bg-destaque-suave text-destaque-forte border-destaque-borda',
}

export function Selo({ tom = 'neutro', children }: { tom?: Tom; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-medium ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}

export function tomDoStatus(status: string): Tom {
  if (status === 'Ativa' || status === 'Ativo' || status === 'Pago' || status === 'Quitada')
    return 'ativo'
  if (status === 'Encerrada' || status === 'Encerrado' || status === 'Rascunho') return 'encerrado'
  if (status === 'Pendente' || status === 'Parcial' || status === 'Desistida') return 'alerta'
  return 'neutro'
}
