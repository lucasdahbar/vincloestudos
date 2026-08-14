import Link from 'next/link'
import { listarCobrancas } from '@/dados/cobrancas'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { PainelGeracao } from './PainelGeracao'

const TOM: Record<string, 'ativo' | 'encerrado' | 'alerta' | 'neutro'> = {
  Rascunho: 'encerrado',
  Confirmada: 'neutro',
  Enviada: 'neutro',
  Parcial: 'alerta',
  Quitada: 'ativo',
}

export default async function PaginaCobrancas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  await exigirGestora()
  const { mes } = await searchParams
  const agora = new Date()
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`

  const cobrancas = await listarCobrancas(mes ? { mes } : {})
  const total = cobrancas.reduce((s, c) => s + c.valor_total, 0)
  const recebido = cobrancas.reduce((s, c) => s + c.recebido, 0)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Cobranças</h1>
        <p className="mt-1 text-tinta-suave">
          {cobrancas.length} cobrança(s) · {formatarBRL(total)} no total ·{' '}
          {formatarBRL(recebido)} recebido
        </p>
      </header>

      <PainelGeracao mesInicial={mes ?? mesAtual} />

      {cobrancas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma cobrança ainda"
          descricao="Escolha o mês acima e gere as cobranças. O sistema junta as aulas previstas de cada responsável, agrupando todos os filhos."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {cobrancas.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cobrancas/${c.id}`}
                className="block rounded-cartao border border-borda bg-superficie p-5 transition-all hover:-translate-y-0.5 hover:border-destaque/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.responsavel?.nome}</p>
                    <p className="mt-1 text-sm text-tinta-suave">
                      {c.mes_referencia.slice(0, 7).split('-').reverse().join('/')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-titulo text-xl">{formatarBRL(c.valor_total)}</p>
                    {c.recebido > 0 && c.recebido < c.valor_total && (
                      <p className="text-sm text-alerta">
                        falta {formatarBRL(c.valor_total - c.recebido)}
                      </p>
                    )}
                    <div className="mt-1">
                      <Selo tom={TOM[c.status]}>{c.status}</Selo>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
