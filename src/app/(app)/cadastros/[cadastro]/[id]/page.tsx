import { notFound } from 'next/navigation'
import { CADASTROS } from '@/cadastros/definicoes'
import { Formulario } from '@/cadastros/motor/Formulario'
import { carregarReferencias } from '@/cadastros/motor/referencias'
import { PainelRelacionados, paineisDe } from '@/cadastros/motor/Relacionados'
import { obter } from '@/dados/crud'
import { exigirGestora } from '@/dados/sessao'

export default async function PaginaEdicao({
  params,
}: {
  params: Promise<{ cadastro: string; id: string }>
}) {
  await exigirGestora()

  const { cadastro, id } = await params
  const definicao = CADASTROS[cadastro]
  if (!definicao) notFound()

  const registro = await obter(definicao, Number(id))
  if (!registro) notFound()

  const referencias = await carregarReferencias(definicao)
  const paineis = await paineisDe(cadastro, Number(id))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{String(registro.nome ?? definicao.rotulo.singular)}</h1>
      <Formulario
        definicao={definicao}
        registro={registro as Record<string, unknown> & { id: number }}
        referencias={referencias}
      />

      {paineis.length > 0 && (
        <div className="flex max-w-2xl flex-col gap-4">
          {paineis.map((painel) => (
            <PainelRelacionados key={painel.titulo} painel={painel} />
          ))}
        </div>
      )}
    </div>
  )
}
