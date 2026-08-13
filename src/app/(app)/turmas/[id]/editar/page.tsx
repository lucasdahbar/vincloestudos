import { notFound } from 'next/navigation'
import { obterTurma, opcoesDeTurma } from '@/dados/turmas'
import { exigirGestora } from '@/dados/sessao'
import { FormularioTurma } from '../../FormularioTurma'

export default async function PaginaEditarTurma({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirGestora()
  const { id } = await params
  const [turma, opcoes] = await Promise.all([obterTurma(Number(id)), opcoesDeTurma()])
  if (!turma) notFound()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Editar turma</h1>
      <FormularioTurma opcoes={opcoes} turma={turma} />
    </div>
  )
}
