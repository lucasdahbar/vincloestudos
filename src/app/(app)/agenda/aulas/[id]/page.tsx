import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listaDaAula, obterAula } from '@/dados/aulas'
import { tokenDaAula } from '@/dados/presencas'
import { LinkDeChamada } from './LinkDeChamada'
import { AvisarFalta } from './AvisarFalta'
import { ExcluirAula } from './ExcluirAula'
import { CorrigirChamada } from './CorrigirChamada'
import { RemarcarAula } from './RemarcarAula'
import { CancelarAviso } from '../../../reposicoes/CancelarAviso'

/** O que aconteceu depois do aviso, do ponto de vista desta aula. */
const ROTULO_AVISO = {
  Pendente: 'Reposição pendente',
  Agendada: 'Reposição marcada',
  Realizada: 'Reposição feita',
  Desistida: 'Sem reposição',
} as const
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
  // Remarcada (13/10/2026): o horário que a regra da turma deu a ela.
  const original = aula.data_hora_original ? String(aula.data_hora_original).slice(0, 16) : null
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
      .select('aluno_id, presente, observacao, conta_pagar_id, aluno:alunos!aluno_id (nome)')
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
    conta_pagar_id: number | null
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
          {original && (
            <Selo tom="alerta">
              Remarcada (era {original.slice(8, 10)}/{original.slice(5, 7)} às {original.slice(11, 16)})
            </Selo>
          )}
        </div>
      </header>

      <Cartao>
        <h2 className="mb-3 text-lg">
          {registradas.length > 0 ? 'Presenças registradas' : 'Alunos matriculados'}
        </h2>

        {registradas.length > 0 ? (
          <>
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
          {ehGestora && aula.status === 'Realizada' && (
            <CorrigirChamada
              aulaId={aula.id}
              alunos={registradas.map((p) => ({
                aluno_id: p.aluno_id,
                nome: p.aluno?.nome ?? 'Aluno',
                presente: p.presente,
              }))}
              travada={
                registradas.some((p) => p.conta_pagar_id !== null)
                  ? 'O pagamento do professor desta aula já foi fechado: não dá para corrigir a chamada.'
                  : null
              }
            />
          )}
          </>
        ) : lista.chamada.length === 0 ? (
          <p className="text-tinta-suave">
            {lista.avisaram.length > 0
              ? 'Todos os alunos desta aula já avisaram que não vêm.'
              : 'Nenhum aluno matriculado nesta turma na data da aula.'}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-borda/60">
              {lista.chamada.map((m) => (
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

      {/* Rodada 3: quem avisou continua visivel, marcado e fora da chamada —
          sem presenca nem falta, porque a aula nao conta para o professor. */}
      {lista.avisaram.length > 0 && (
        <Cartao>
          <h2 className="mb-1 text-lg">Avisaram que não vêm</h2>
          <p className="mb-3 text-sm text-tinta-suave">
            Aparecem para o professor, mas sem presença nem falta. A reposição e a cobrança de
            cada um se resolvem em{' '}
            <Link href="/reposicoes" className="text-destaque hover:underline">
              Reposições
            </Link>
            .
          </p>
          <ul className="divide-y divide-borda/60">
            {lista.avisaram.map((m) => (
              <li key={m.aluno_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link
                  href={`/cadastros/alunos/${m.aluno_id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {m.nome}
                </Link>
                <span className="flex items-center gap-3">
                  <Selo tom={m.status === 'Pendente' ? 'alerta' : 'neutro'}>
                    {ROTULO_AVISO[m.status]}
                  </Selo>
                  {ehGestora && <CancelarAviso pendenciaId={m.pendencia_id} nome={m.nome} />}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {ehGestora && aula.status !== 'Cancelada' && aula.status !== 'Excluída' && (
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

      {ehGestora && aula.status !== 'Excluída' && aula.status !== 'Realizada' && (
        <div className="flex flex-wrap gap-3">
          {registradas.length === 0 && aula.status === 'Agendada' && (
            <RemarcarAula
              aulaId={aula.id}
              inicio={String(aula.data_hora_inicio).slice(0, 16)}
              fim={String(aula.data_hora_fim).slice(0, 16)}
              original={original}
              fimOriginal={
                original && aula.turma
                  ? `${original.slice(0, 10)}T${String(aula.turma.horario_fim).slice(0, 5)}`
                  : null
              }
            />
          )}
          <ExcluirAula aulaId={aula.id} quando={quando} />
        </div>
      )}

      <Link href="/agenda" className="text-destaque hover:underline">
        ← Voltar para a agenda
      </Link>
    </div>
  )
}
