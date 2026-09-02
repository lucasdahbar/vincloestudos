import { notFound } from 'next/navigation'
import { CADASTROS } from '@/cadastros/definicoes'
import { Formulario } from '@/cadastros/motor/Formulario'
import { carregarReferencias } from '@/cadastros/motor/referencias'
import { PainelRelacionados, paineisDe } from '@/cadastros/motor/Relacionados'
import { BotaoExcluir } from '@/cadastros/motor/BotaoExcluir'
import { paraCliente } from '@/cadastros/tipos'
import { LinkDoProfessor } from './LinkDoProfessor'
import { headers } from 'next/headers'
import { obter } from '@/dados/crud'
import { tokenDoProfessor } from '@/dados/professores'
import { exigirGestora } from '@/dados/sessao'

/**
 * O link permanente do professor, se ele ja tem um.
 *
 * `obter()` traz so os campos declarados no cadastro, e `token_presenca` nao e
 * um deles de proposito: e segredo, nao campo de formulario.
 */
async function linkDoProfessor(id: number): Promise<string | null> {
  const token = await tokenDoProfessor(id)
  if (!token) return null

  const cabecalhos = await headers()
  const anfitriao = cabecalhos.get('host') ?? ''
  const protocolo = anfitriao.startsWith('localhost') ? 'http' : 'https'
  return `${protocolo}://${anfitriao}/p/professor/${token}`
}

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
        definicao={paraCliente(definicao)}
        registro={registro as Record<string, unknown> & { id: number }}
        referencias={referencias}
      />

      {/* R1: o link permanente de presenca deste professor. */}
      {cadastro === 'professores' && (
        <div className="max-w-2xl">
          <LinkDoProfessor
            professorId={Number(id)}
            nome={String(registro.nome ?? 'Professor')}
            telefone={(registro.telefone as string | null) ?? null}
            linkInicial={await linkDoProfessor(Number(id))}
          />
        </div>
      )}

      {/* LGPD Art. 18: so as entidades que guardam dado pessoal de pessoa
          fisica (Secoes 4.4, 5.5, 5.7, 6.3 e 6.5). */}
      {['professores', 'responsaveis', 'alunos'].includes(cadastro) && (
        <div className="max-w-2xl border-t border-borda pt-6">
          <h2 className="text-lg">Excluir este cadastro</h2>
          <p className="mb-4 mt-1 text-sm text-tinta-suave">
            Se houver histórico financeiro ou de aulas, os dados pessoais são apagados e o
            histórico é preservado. Você vê o que vai acontecer antes de confirmar.
          </p>
          <BotaoExcluir
            entidade={cadastro}
            id={Number(id)}
            nome={String(registro.nome ?? 'este cadastro')}
            rota={cadastro}
          />
        </div>
      )}

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
