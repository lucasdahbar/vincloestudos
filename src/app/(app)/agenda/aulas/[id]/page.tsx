import Link from 'next/link'
import { notFound } from 'next/navigation'
import { matriculadosNaAula, obterAula } from '@/dados/aulas'
import { clienteServidor } from '@/dados/cliente'
import { exigirSessao } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'

export default async function PaginaAula({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao()
  const { id } = await params
  const aula = await obterAula(Number(id))
  if (!aula) notFound()

  const supabase = await clienteServidor()
  const [matriculados, { data: presencas }] = await Promise.all([
    matriculadosNaAula(aula.id),
    supabase
      .from('presencas')
      .select('aluno_id, presente, observacao, aluno:alunos!aluno_id (nome)')
      .eq('aula_id', aula.id),
  ])

  const registradas = (presencas ?? []) as unknown as {
    aluno_id: number
    presente: boolean
    observacao: string | null
    aluno: { nome: string } | null
  }[]

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">{aula.turma?.nome}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-tinta-suave">
          <Selo tom={aula.status === 'Realizada' ? 'ativo' : 'neutro'}>{aula.status}</Selo>
          <span>
            {new Date(aula.data_hora_inicio).toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </header>

      <Cartao>
        <h2 className="mb-3 text-lg">
          {registradas.length > 0 ? 'Presenças registradas' : 'Alunos matriculados'}
        </h2>

        {registradas.length > 0 ? (
          <ul className="divide-y divide-borda/60">
            {registradas.map((p) => (
              <li key={p.aluno_id} className="flex items-center justify-between gap-3 py-3">
                <span>
                  {p.aluno?.nome}
                  {p.observacao && (
                    <span className="block text-sm text-tinta-suave">{p.observacao}</span>
                  )}
                </span>
                <Selo tom={p.presente ? 'ativo' : 'alerta'}>
                  {p.presente ? 'Presente' : 'Faltou'}
                </Selo>
              </li>
            ))}
          </ul>
        ) : matriculados.length === 0 ? (
          <p className="text-tinta-suave">Nenhum aluno matriculado nesta turma na data da aula.</p>
        ) : (
          <>
            <ul className="divide-y divide-borda/60">
              {matriculados.map((m) => (
                <li key={m.aluno_id} className="flex items-center justify-between gap-3 py-3">
                  <Link
                    href={`/cadastros/alunos/${m.aluno_id}`}
                    className="font-medium text-destaque hover:underline"
                  >
                    {m.nome}
                  </Link>
                  {m.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-tinta-suave">
              A chamada ainda não foi registrada. Gere o link e envie ao professor.
            </p>
          </>
        )}
      </Cartao>

      <Link href="/agenda" className="text-destaque hover:underline">
        ← Voltar para a agenda
      </Link>
    </div>
  )
}
