import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { rotuloDaTurma } from '@/dominio/turmas/quando'
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
    supabase
      .from('turmas')
      .select('id, nome, tipo_recorrencia, data_unica, dias_semana, frequencia, intervalo, data_inicio, horario_inicio')
      .eq('status', 'Ativa')
      .order('nome')
      .order('horario_inicio'),
  ])

  // Turmas de mesmo nome em dias e horarios diferentes: so o quando as separa.
  const opcoesDeTurma = (turmas.data ?? []).map((t) => ({ id: t.id, nome: rotuloDaTurma(t) }))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Nova matrícula</h1>
      <FormularioMatricula
        alunos={alunos.data ?? []}
        turmas={opcoesDeTurma}
        turmaFixa={turma ? Number(turma) : undefined}
        alunoFixo={aluno ? Number(aluno) : undefined}
      />
    </div>
  )
}
