import Link from 'next/link'
import { listarCreditos } from '@/dados/creditos'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { titulo } from '@/marca'
import { UsarCredito } from './UsarCredito'

export const metadata = { title: titulo('Créditos') }

export default async function PaginaCreditos() {
  await exigirGestora()
  const supabase = await clienteServidor()
  const [creditos, { data: contas }] = await Promise.all([
    listarCreditos(),
    supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
  ])

  const comSaldo = creditos.filter((c) => c.saldo > 0)
  const total = comSaldo.reduce((t, c) => t + c.saldo, 0)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Créditos</h1>
        <p className="mt-1 text-tinta-suave">
          {comSaldo.length === 0
            ? 'Nenhum crédito em aberto.'
            : `${comSaldo.length} em aberto · ${formatarBRL(total)} a usar ou devolver`}
        </p>
      </header>

      {creditos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum crédito"
          descricao="Um crédito nasce quando uma aula já cobrada deixa de ser cobrada, porque o aluno não foi e não houve reposição. Ele aparece aqui para ser abatido de uma cobrança ou devolvido."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {creditos.map((c) => (
            <li key={c.id}>
              <Cartao>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/cadastros/responsaveis/${c.responsavel_id}`}
                      className="font-medium text-destaque hover:underline"
                    >
                      {c.responsavel_nome}
                    </Link>
                    <p className="mt-1 text-sm text-tinta-suave">{c.descricao}</p>
                  </div>
                  <div className="text-right">
                    <Selo tom={c.saldo > 0 ? 'alerta' : 'encerrado'}>
                      {c.saldo > 0 ? `Saldo ${formatarBRL(c.saldo)}` : 'Usado'}
                    </Selo>
                    <p className="mt-1 text-sm text-tinta-suave">de {formatarBRL(c.valor)}</p>
                  </div>
                </div>

                {c.usos.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1 text-sm text-tinta-suave">
                    {c.usos.map((u, i) => (
                      <li key={i}>
                        {u.data.split('-').reverse().join('/')} ·{' '}
                        {u.tipo === 'Abatimento' ? 'Abatido de cobrança' : 'Devolvido'} ·{' '}
                        {formatarBRL(u.valor)}
                      </li>
                    ))}
                  </ul>
                )}

                {c.saldo > 0 && (
                  <div className="mt-4">
                    <UsarCredito
                      creditoId={c.id}
                      saldo={c.saldo}
                      cobrancas={c.cobrancasAbertas}
                      contas={contas ?? []}
                    />
                  </div>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
