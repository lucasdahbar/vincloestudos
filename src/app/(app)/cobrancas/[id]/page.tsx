import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterCobranca } from '@/dados/cobrancas'
import { recebimentosDaCobranca } from '@/dados/recebimentos'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'
import { EditorItens } from './EditorItens'

export default async function PaginaCobranca({ params }: { params: Promise<{ id: string }> }) {
  await exigirGestora()
  const { id } = await params
  const cobranca = await obterCobranca(Number(id))
  if (!cobranca) notFound()

  const recebimentos = await recebimentosDaCobranca(cobranca.id)
  const recebido = recebimentos.reduce((s, r) => s + r.valor_recebido, 0)
  const saldo = Math.max(0, cobranca.valor_total - recebido)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{cobranca.responsavel?.nome}</h1>
          <p className="mt-1 text-tinta-suave">
            {cobranca.mes_referencia.slice(0, 7).split('-').reverse().join('/')}
          </p>
        </div>
        <Selo>{cobranca.status}</Selo>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Cartao>
          <p className="text-sm text-tinta-suave">Total</p>
          <p className="font-titulo text-2xl">{formatarBRL(cobranca.valor_total)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-tinta-suave">Recebido</p>
          <p className="font-titulo text-2xl text-apoio">{formatarBRL(recebido)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-tinta-suave">Em aberto</p>
          <p className={`font-titulo text-2xl ${saldo > 0 ? 'text-alerta' : 'text-apoio'}`}>
            {formatarBRL(saldo)}
          </p>
        </Cartao>
      </div>

      <EditorItens
        cobrancaId={cobranca.id}
        status={cobranca.status}
        texto={cobranca.texto_whatsapp}
        itens={cobranca.itens.map((i) => ({
          id: i.id,
          aluno_nome: i.aluno?.nome ?? 'Aluno',
          descricao: i.descricao,
          data: i.data,
          valor_original: i.valor_original,
          desconto: i.desconto,
          valor_final: i.valor_final,
        }))}
      />

      {saldo > 0 && cobranca.status !== 'Rascunho' && (
        <BotaoLink href={`/recebimentos?cobranca=${cobranca.id}`}>Registrar recebimento</BotaoLink>
      )}

      {recebimentos.length > 0 && (
        <Cartao>
          <h2 className="mb-3 text-lg">Recebimentos</h2>
          <ul className="divide-y divide-borda/60">
            {recebimentos.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <span>
                  {r.data_recebimento.split('-').reverse().join('/')}
                  <span className="ml-2 text-sm text-tinta-suave">
                    {r.forma_pagamento ?? ''} {r.conta?.nome ? `· ${r.conta.nome}` : ''}
                  </span>
                </span>
                <span className="font-medium">{formatarBRL(r.valor_recebido)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Link href="/cobrancas" className="text-destaque hover:underline">
        ← Voltar para as cobranças
      </Link>
    </div>
  )
}
