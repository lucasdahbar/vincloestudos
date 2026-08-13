import { notFound } from 'next/navigation'
import { CADASTROS } from '@/cadastros/definicoes'
import { Formulario } from '@/cadastros/motor/Formulario'
import { carregarReferencias } from '@/cadastros/motor/referencias'
import { exigirGestora } from '@/dados/sessao'

export default async function PaginaNovo({
  params,
}: {
  params: Promise<{ cadastro: string }>
}) {
  await exigirGestora()

  const { cadastro } = await params
  const definicao = CADASTROS[cadastro]
  if (!definicao) notFound()

  const referencias = await carregarReferencias(definicao)
  const artigo = definicao.rotulo.genero === 'f' ? 'Nova' : 'Novo'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">
        {artigo} {definicao.rotulo.singular.toLowerCase()}
      </h1>
      <Formulario definicao={definicao} referencias={referencias} />
    </div>
  )
}
