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

  const pendentes = contas.filter((c) => c.status === 'Pendente')

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
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie p-5"
            >
              <div>
                <p className="font-medium">{c.professor?.nome}</p>
                <p className="mt-1 text-sm text-tinta-suave">
                  {c.periodo_inicio.split('-').reverse().join('/')} a{' '}
                  {c.periodo_fim.split('-').reverse().join('/')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-titulo text-lg">{formatarBRL(c.valor_total)}</span>
                <Selo tom={c.status === 'Pago' ? 'ativo' : 'alerta'}>{c.status}</Selo>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
