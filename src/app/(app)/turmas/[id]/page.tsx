import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterTurma } from '@/dados/turmas'
import { listarMatriculas } from '@/dados/matriculas'
import { exigirSessao } from '@/dados/sessao'
import { nomesDosDias } from '@/dominio/tipos'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

export default async function PaginaTurma({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao()
  const { id } = await params
  const turma = await obterTurma(Number(id))
  if (!turma) notFound()

  const matriculas = await listarMatriculas({ turmaId: turma.id, status: 'Ativa' })
  const ehGestora = sessao.papel === 'gestora'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{turma.nome}</h1>
          <div className="mt-2 flex items-center gap-3">
            <Selo tom={turma.status === 'Ativa' ? 'ativo' : 'encerrado'}>{turma.status}</Selo>
            <span className="text-tinta-suave">
              {nomesDosDias(turma.dias_semana)} · {turma.horario_inicio.slice(0, 5)} às{' '}
              {turma.horario_fim.slice(0, 5)}
            </span>
          </div>
        </div>
        {ehGestora && (
          <BotaoLink href={`/turmas/${turma.id}/editar`} aparencia="secundario">
            Editar turma
          </BotaoLink>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Cartao>
          <h2 className="mb-3 text-lg">Composição</h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Professor</dt>
              <dd>
                <Link
                  href={`/cadastros/professores/${turma.professor_id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {turma.professor?.nome}
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Serviço</dt>
              <dd>{turma.servico?.nome}</dd>
            </div>
            {turma.materia && (
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Matéria</dt>
                <dd>{turma.materia.nome}</dd>
              </div>
            )}
            {turma.escola && (
              <div className="flex justify-between gap-4">
                <dt className="text-tinta-suave">Escola</dt>
                <dd>{turma.escola.nome}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Ano escolar</dt>
              <dd>{turma.ano_escolar?.nome}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-suave">Modalidade</dt>
              <dd>{turma.modalidade}</dd>
            </div>
          </dl>
        </Cartao>

        <Cartao>
          <h2 className="mb-3 text-lg">Agenda</h2>
          <AgendaDaTurma
            eventoId={turma.google_calendar_event_id}
            agendaDoProfessor={turma.professor?.google_calendar_id ?? null}
            professor={turma.professor?.nome ?? 'o professor'}
            encerrada={turma.status !== 'Ativa'}
          />
        </Cartao>
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Alunos matriculados</h2>
          {ehGestora && turma.status === 'Ativa' && (
            <BotaoLink href={`/matriculas/nova?turma=${turma.id}`} aparencia="secundario">
              + Adicionar aluno
            </BotaoLink>
          )}
        </div>

        {matriculas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum aluno matriculado"
            descricao="Matricule alunos para que eles passem a contar nas aulas e nas cobranças desta turma."
            acao={
              ehGestora &&
              turma.status === 'Ativa' && (
                <BotaoLink href={`/matriculas/nova?turma=${turma.id}`}>+ Adicionar aluno</BotaoLink>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-borda rounded-cartao border border-borda bg-superficie">
            {matriculas.map((matricula) => (
              <li key={matricula.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <Link
                  /* T3: abre a matricula daquele aluno NESTA turma, com as
                     datas e a opcao de desmatricular — nao o cadastro geral. */
                  href={`/matriculas/${matricula.id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {matricula.aluno?.nome}
                </Link>
                {matricula.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * O que a agenda do Google sabe desta turma (G2).
 *
 * São quatro estados, e cada um pede uma ação diferente de quem lê. O texto
 * antigo prometia a sincronização "a partir do Plano 2" mesmo depois de ela
 * entrar no ar — dizia o contrário do que o sistema fazia.
 */
function AgendaDaTurma({
  eventoId,
  agendaDoProfessor,
  professor,
  encerrada,
}: {
  eventoId: string | null
  agendaDoProfessor: string | null
  professor: string
  encerrada: boolean
}) {
  const texto = 'text-sm text-tinta-suave'

  if (eventoId && agendaDoProfessor) {
    // Sem link para o evento de propósito: o `eid` de um evento recorrente
    // leva um sufixo de data que só o Google monta, e a URL que dá para
    // derivar daqui nem sempre abre. Guardar o `htmlLink` na hora de criar o
    // evento resolveria — fica para quando valer o campo a mais.
    return (
      <p className={texto}>
        As aulas estão na agenda de {professor}, no Google. Editar a turma atualiza o evento; encerrá-la
        o remove.
      </p>
    )
  }

  if (encerrada) {
    return <p className={texto}>Turma encerrada: o evento foi retirado da agenda do professor.</p>
  }

  if (!agendaDoProfessor) {
    return (
      <p className={texto}>
        {professor} ainda não tem uma agenda do Google no cadastro, então esta turma não gera
        evento. Preencha o campo <strong>Agenda do Google</strong> no cadastro do professor.
      </p>
    )
  }

  return (
    <p className={texto}>
      Esta turma ainda não tem evento na agenda. Salvar a turma de novo refaz a sincronização.
    </p>
  )
}
