import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CADASTROS, ROTAS_DE_CADASTRO } from '@/cadastros/definicoes'
import { Tabela } from '@/cadastros/motor/Tabela'
import { listar } from '@/dados/crud'
import { exigirGestora } from '@/dados/sessao'
import { BotaoLink } from '@/ui/Botao'
import { Busca } from '@/ui/Busca'
import { EstadoVazio } from '@/ui/EstadoVazio'

export function generateStaticParams() {
  return ROTAS_DE_CADASTRO.map((cadastro) => ({ cadastro }))
}

export default async function PaginaListagem({
  params,
  searchParams,
}: {
  params: Promise<{ cadastro: string }>
  searchParams: Promise<{ busca?: string }>
}) {
  await exigirGestora()

  const { cadastro } = await params
  const { busca } = await searchParams
  const definicao = CADASTROS[cadastro]
  if (!definicao) notFound()

  const registros = await listar(definicao, { busca })
  const artigo = definicao.rotulo.genero === 'f' ? 'Nova' : 'Novo'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">{definicao.rotulo.plural}</h1>
          <p className="mt-1 text-tinta-suave">
            {registros.length} {registros.length === 1 ? 'registro' : 'registros'}
          </p>
        </div>
        <BotaoLink href={`/cadastros/${cadastro}/novo`}>
          + {artigo} {definicao.rotulo.singular.toLowerCase()}
        </BotaoLink>
      </header>

      {definicao.camposBuscaveis.length > 0 && (
        <Suspense>
          <Busca placeholder={`Buscar ${definicao.rotulo.plural.toLowerCase()}…`} />
        </Suspense>
      )}

      {registros.length === 0 ? (
        <EstadoVazio
          titulo={busca ? 'Nada encontrado' : `Nenhum registro ainda`}
          descricao={
            busca
              ? 'Tente outro termo de busca.'
              : (definicao.dicaVazio ?? `Comece cadastrando ${definicao.rotulo.singular.toLowerCase()}.`)
          }
          acao={
            !busca && (
              <BotaoLink href={`/cadastros/${cadastro}/novo`}>
                + {artigo} {definicao.rotulo.singular.toLowerCase()}
              </BotaoLink>
            )
          }
        />
      ) : (
        <Tabela definicao={definicao} registros={registros} />
      )}
    </div>
  )
}
