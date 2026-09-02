import Link from 'next/link'
import { notFound } from 'next/navigation'
import { clienteServidor } from '@/dados/cliente'
import {
  baixasDaConta,
  obterContaPagar,
  relatorioFechamento,
  textoDoFechamento,
} from '@/dados/pagamentos'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'
import { FormularioBaixa } from './FormularioBaixa'
import { RelatorioFechamento } from './RelatorioFechamento'

export default async function PaginaContaPagar({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirGestora()

  const { id } = await params
  const conta = await obterContaPagar(Number(id))
  if (!conta) notFound()

  const supabase = await clienteServidor()
  const [baixas, linhas, texto, { data: contas }, { data: responsaveis }] = await Promise.all([
    baixasDaConta(conta.id),
    relatorioFechamento(conta.id),
    textoDoFechamento(conta.id),
    supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('responsaveis').select('id, nome').eq('ativo', true).order('nome'),
  ])

  const pago = baixas.reduce((s, b) => s + b.valor, 0)
  const saldo = Math.max(0, conta.valor_total - pago)
  const cancelada = conta.status === 'Cancelada'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl">{conta.professor_nome}</h1>
          <p className="mt-1 text-tinta-suave">
            Fechamento até {conta.periodo_fim.split('-').reverse().join('/')}
          </p>
        </div>
        <Selo tom={conta.status === 'Pago' ? 'ativo' : cancelada ? 'encerrado' : 'alerta'}>
          {conta.status}
        </Selo>
      </header>

      <div className="grid gap-4 sm:grid-cols-3 print:hidden">
        <Cartao>
          <p className="text-sm text-tinta-suave">Total</p>
          <p className="font-titulo text-2xl">{formatarBRL(conta.valor_total)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-tinta-suave">Pago</p>
          <p className="font-titulo text-2xl text-apoio">{formatarBRL(pago)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-tinta-suave">Em aberto</p>
          <p className={`font-titulo text-2xl ${saldo > 0 ? 'text-alerta' : 'text-apoio'}`}>
            {formatarBRL(cancelada ? 0 : saldo)}
          </p>
        </Cartao>
      </div>

      {cancelada && (
        <Cartao className="border-borda bg-superficie-2 print:hidden">
          <p className="text-tinta-suave">
            Este fechamento foi cancelado. As {linhas.length > 0 ? linhas.length : ''} presenças
            dele voltaram a ficar disponíveis e entram no próximo fechamento deste professor.
            O valor de {formatarBRL(conta.valor_total)} fica registrado só como histórico.
          </p>
        </Cartao>
      )}

      {/* P3: a ação de dar baixa faltava por completo. */}
      {!cancelada && saldo > 0 && (
        <div className="print:hidden">
          <FormularioBaixa
            contaId={conta.id}
            saldo={saldo}
            contas={contas ?? []}
            responsaveis={responsaveis ?? []}
          />
        </div>
      )}

      {baixas.length > 0 && (
        <Cartao className="print:hidden">
          <h2 className="mb-3 text-lg">Pagamentos registrados</h2>
          <ul className="divide-y divide-borda/60">
            {baixas.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  {b.data.split('-').reverse().join('/')}
                  <span className="ml-2 text-sm text-tinta-suave">
                    {/* P4: de onde saiu importa para o relatório de pagamentos
                        feitos fora da conta da empresa. */}
                    {b.origem === 'Pago por responsável'
                      ? `pago por ${b.responsavel?.nome ?? 'responsável'}`
                      : b.origem === 'Conta própria'
                        ? (b.conta?.nome ?? 'conta da empresa')
                        : 'outra origem'}
                    {b.forma_pagamento ? ` · ${b.forma_pagamento}` : ''}
                  </span>
                  {b.observacao && (
                    <span className="block text-sm text-tinta-tenue">{b.observacao}</span>
                  )}
                </span>
                <span className="font-medium">{formatarBRL(b.valor)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {texto && !cancelada && (
        <RelatorioFechamento
          contaId={conta.id}
          texto={texto}
          telefone={conta.professor_telefone}
          podeCancelar={conta.status === 'Pendente' && baixas.length === 0}
          presencas={linhas.length}
        />
      )}

      <Link href="/pagamentos" className="text-destaque hover:underline print:hidden">
        ← Voltar para os pagamentos
      </Link>
    </div>
  )
}
