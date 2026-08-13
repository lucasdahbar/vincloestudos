type Tom = 'ativo' | 'encerrado' | 'alerta' | 'neutro'

const TONS: Record<Tom, string> = {
  ativo: 'bg-apoio-suave text-apoio',
  encerrado: 'bg-superficie-2 text-tinta-suave',
  alerta: 'bg-alerta-suave text-alerta',
  neutro: 'bg-destaque-suave text-destaque-forte',
}

export function Selo({ tom = 'neutro', children }: { tom?: Tom; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${TONS[tom]}`}
    >
      {children}
    </span>
  )
}

export function tomDoStatus(status: string): Tom {
  if (status === 'Ativa' || status === 'Ativo' || status === 'Pago') return 'ativo'
  if (status === 'Encerrada' || status === 'Encerrado') return 'encerrado'
  if (status === 'Pendente' || status === 'Parcial') return 'alerta'
  return 'neutro'
}
