import Link from 'next/link'
import { listarCobrancas } from '@/dados/cobrancas'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { FormularioBaixa } from './FormularioBaixa'

export default async function PaginaRecebimentos({
  searchParams,
}: {
  searchParams: Promise<{ cobranca?: string }>
}) {
  await exigirGestora()
  const { cobranca } = await searchParams

  const supabase = await clienteServidor()
  const [todas, { data: contas }] = await Promise.all([
    listarCobrancas(),
    supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
  ])

  const emAberto = todas.filter(
    (c) => c.status !== 'Rascunho' && c.valor_total - c.recebido > 0,
  )
  const selecionada = cobranca ? emAberto.find((c) => c.id === Number(cobranca)) : undefined

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Recebimentos</h1>
        <p className="mt-1 text-tinta-suave">
          {emAberto.length} cobrança(s) em aberto ·{' '}
          {formatarBRL(emAberto.reduce((s, c) => s + (c.valor_total - c.recebido), 0))} a receber
        </p>
      </header>

      {selecionada && (
        <Cartao>
          <h2 className="mb-3 text-lg">Registrar recebimento</h2>
          <FormularioBaixa
            cobrancaId={selecionada.id}
            responsavel={selecionada.responsavel?.nome ?? ''}
            saldo={selecionada.valor_total - selecionada.recebido}
            contas={contas ?? []}
          />
        </Cartao>
      )}

      {emAberto.length === 0 ? (
        <EstadoVazio
          titulo="Nada em aberto"
          descricao="Todas as cobranças confirmadas já foram quitadas. Cobranças em rascunho não aparecem aqui."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {emAberto.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie p-5"
            >
              <div>
                <Link href={`/cobrancas/${c.id}`} className="font-medium text-destaque hover:underline">
                  {c.responsavel?.nome}
                </Link>
                <p className="mt-1 text-sm text-tinta-suave">
                  {c.mes_referencia.slice(0, 7).split('-').reverse().join('/')} ·{' '}
                  {formatarBRL(c.valor_total)} · recebido {formatarBRL(c.recebido)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-titulo text-lg text-alerta">
                  {formatarBRL(c.valor_total - c.recebido)}
                </span>
                <Selo tom={c.status === 'Parcial' ? 'alerta' : 'neutro'}>{c.status}</Selo>
                <Link
                  href={`/recebimentos?cobranca=${c.id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  Dar baixa
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
