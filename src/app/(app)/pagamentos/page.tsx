import Link from 'next/link'
import { clienteServidor } from '@/dados/cliente'
import { listarContasPagar } from '@/dados/pagamentos'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { PainelFechamento } from './PainelFechamento'

export default async function PaginaPagamentos() {
  await exigirGestora()
  const supabase = await clienteServidor()

  const [{ data: professores }, contas] = await Promise.all([
    supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
    listarContasPagar(),
  ])

  // Parcial tambem esta em aberto; Cancelada nao deve nada.
  const pendentes = contas.filter((c) => c.status === 'Pendente' || c.status === 'Parcial')

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Pagamentos a professores</h1>
        <p className="mt-1 text-tinta-suave">
          {pendentes.length} pendente(s) ·{' '}
          {formatarBRL(pendentes.reduce((s, c) => s + c.valor_total, 0))} a pagar
        </p>
      </header>

      <PainelFechamento professores={professores ?? []} />

      {contas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum fechamento ainda"
          descricao="Escolha o professor e o período acima, calcule e gere a conta a pagar."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {contas.map((c) => (
            <li key={c.id}>
              {/* P3: daqui se chega a dar baixa — a listagem nao levava a lugar
                  nenhum, entao a conta gerada nunca podia ser paga. */}
              <Link
                href={`/pagamentos/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie p-5 transition-all hover:-translate-y-0.5 hover:border-destaque/40"
              >
                <div>
                  <p className="font-medium">{c.professor?.nome}</p>
                  <p className="mt-1 text-sm text-tinta-suave">
                    Até {c.periodo_fim.split('-').reverse().join('/')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-titulo text-lg">{formatarBRL(c.valor_total)}</span>
                  <Selo
                    tom={
                      c.status === 'Pago'
                        ? 'ativo'
                        : c.status === 'Cancelada'
                          ? 'encerrado'
                          : 'alerta'
                    }
                  >
                    {c.status}
                  </Selo>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
