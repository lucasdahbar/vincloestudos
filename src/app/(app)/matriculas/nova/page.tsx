import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { FormularioMatricula } from '../FormularioMatricula'

export default async function PaginaNovaMatricula({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; aluno?: string }>
}) {
  await exigirGestora()
  const { turma, aluno } = await searchParams
  const supabase = await clienteServidor()

  const [alunos, turmas] = await Promise.all([
    supabase.from('alunos').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('turmas').select('id, nome').eq('status', 'Ativa').order('nome'),
  ])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Nova matrícula</h1>
      <FormularioMatricula
        alunos={alunos.data ?? []}
        turmas={turmas.data ?? []}
        turmaFixa={turma ? Number(turma) : undefined}
        alunoFixo={aluno ? Number(aluno) : undefined}
      />
    </div>
  )
}
