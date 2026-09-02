import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listaDaAula, obterAula } from '@/dados/aulas'
import { tokenDaAula } from '@/dados/presencas'
import { LinkDeChamada } from './LinkDeChamada'
import { AvisarFalta } from './AvisarFalta'
import { clienteServidor } from '@/dados/cliente'
import { exigirSessao } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'

export default async function PaginaAula({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao()
  const { id } = await params
  const aula = await obterAula(Number(id))
  if (!aula) notFound()

  const ehGestora = sessao.papel === 'gestora'
  const quando = new Date(aula.data_hora_inicio).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const supabase = await clienteServidor()
  const [lista, { data: presencas }, token, { data: daTurma }] = await Promise.all([
    listaDaAula(aula.id),
    supabase
      .from('presencas')
      .select('aluno_id, presente, observacao, aluno:alunos!aluno_id (nome)')
      .eq('aula_id', aula.id),
    tokenDaAula(aula.id),
    supabase
      .from('turmas')
      .select('professor:professores!professor_id (nome, telefone)')
      .eq('id', aula.turma_id)
      .maybeSingle(),
  ])

  const professor = daTurma?.professor as unknown as
    | { nome: string; telefone: string | null }
    | null
  const professorNome = professor?.nome ?? null

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
        ) : lista.presentes.length === 0 ? (
          <p className="text-tinta-suave">
            {lista.aguardandoReposicao.length > 0
              ? 'Todos os alunos desta aula já avisaram que não vêm.'
              : 'Nenhum aluno matriculado nesta turma na data da aula.'}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-borda/60">
              {lista.presentes.map((m) => (
                <li key={m.aluno_id} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3">
                    <Link
                      href={`/cadastros/alunos/${m.aluno_id}`}
                      className="font-medium text-destaque hover:underline"
                    >
                      {m.nome}
                    </Link>
                    {m.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
                  </span>
                  {/* R2: registrar aviso previo, antes de a aula acontecer. */}
                  {ehGestora && aula.status === 'Agendada' && (
                    <AvisarFalta alunoId={m.aluno_id} aulaId={aula.id} nome={m.nome} />
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-tinta-suave">
              A chamada ainda não foi registrada. Gere o link e envie ao professor.
            </p>
          </>
        )}
      </Cartao>

      {/* R3: quem saiu da lista desta aula. Sem este bloco a gestora veria o
          aluno simplesmente sumir, sem saber por que. */}
      {lista.aguardandoReposicao.length > 0 && (
        <Cartao>
          <h2 className="mb-1 text-lg">Avisaram que não vêm</h2>
          <p className="mb-3 text-sm text-tinta-suave">
            Não entram na chamada desta aula. Ficam em{' '}
            <Link href="/reposicoes" className="text-destaque hover:underline">
              Reposições
            </Link>{' '}
            até você marcar a reposição ou registrar a desistência.
          </p>
          <ul className="divide-y divide-borda/60">
            {lista.aguardandoReposicao.map((m) => (
              <li key={m.aluno_id} className="flex items-center justify-between gap-3 py-3">
                <Link
                  href={`/cadastros/alunos/${m.aluno_id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {m.nome}
                </Link>
                <Selo tom="alerta">Reposição pendente</Selo>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {ehGestora && aula.status !== 'Cancelada' && (
        <LinkDeChamada
          aulaId={aula.id}
          turmaNome={aula.turma?.nome ?? 'a turma'}
          professorNome={professorNome}
          professorTelefone={professor?.telefone ?? null}
          quando={quando}
          caminhoExistente={token && !token.usado_em ? `/p/presenca/${token.token}` : null}
          jaConfirmada={Boolean(token?.usado_em)}
        />
      )}

      <Link href="/agenda" className="text-destaque hover:underline">
        ← Voltar para a agenda
      </Link>
    </div>
  )
}
