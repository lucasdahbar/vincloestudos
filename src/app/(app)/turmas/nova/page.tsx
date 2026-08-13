import { opcoesDeTurma } from '@/dados/turmas'
import { exigirGestora } from '@/dados/sessao'
import { FormularioTurma } from '../FormularioTurma'

export default async function PaginaNovaTurma() {
  await exigirGestora()
  const opcoes = await opcoesDeTurma()

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Nova turma</h1>
      <FormularioTurma opcoes={opcoes} />
    </div>
  )
}
