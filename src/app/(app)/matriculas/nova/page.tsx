import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { rotuloDaTurma } from '@/dominio/turmas/quando'
import { FormularioMatricula } from '../FormularioMatricula'

export default async function PaginaNovaMatricula({
  searchParams,
}: {
  searchParams: Promise<{ turma?: string; aluno?: string; inicio?: string; fim?: string; voltar?: string }>
}) {
  await exigirGestora()
  const { turma, aluno, inicio, fim, voltar } = await searchParams
  const data = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
  // So caminho interno: o parametro vem da URL e nao pode mandar a gestora para fora.
  const voltarPara = voltar?.startsWith('/') && !voltar.startsWith('//') ? voltar : undefined
  const avulsa = !!data(inicio) && data(inicio) === data(fim)
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
      <h1 className="text-3xl">{avulsa ? 'Aula avulsa' : 'Nova matrícula'}</h1>
      {avulsa && (
        <p className="-mt-3 text-tinta-suave">
          O aluno entra só na aula deste dia. Ela é cobrada como uma aula da turma e não manda a
          mensagem de boas-vindas.
        </p>
      )}
      <FormularioMatricula
        alunos={alunos.data ?? []}
        turmas={opcoesDeTurma}
        turmaFixa={turma ? Number(turma) : undefined}
        alunoFixo={aluno ? Number(aluno) : undefined}
        inicio={data(inicio)}
        fim={data(fim)}
        voltarPara={voltarPara}
      />
    </div>
  )
}
