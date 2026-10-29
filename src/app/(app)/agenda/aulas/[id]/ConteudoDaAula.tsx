import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listaDaAula, obterAula } from '@/dados/aulas'
import { linksDaAula } from '@/dados/links-da-aula'
import { tokenDaAula } from '@/dados/presencas'
import { LinkDeChamada } from './LinkDeChamada'
import { AvisarFalta } from './AvisarFalta'
import { EnviarLink } from './EnviarLink'
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
import { situacoesDasAulas } from '@/dados/situacao-das-aulas'
import { pilulaDaSituacao } from '@/ui/situacao-da-aula'
import { exigirSessao } from '@/dados/sessao'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'

/**
 * Tudo da aula: alunos, chamada, avisos, remarcar e excluir. Etapa 5 (28/10/2026):
 * a mesma tela serve a pagina inteira e o painel que abre por cima da agenda,
 * para as duas nunca divergirem.
 */
export async function ConteudoDaAula({ id, noPainel = false }: { id: number; noPainel?: boolean }) {
  const sessao = await exigirSessao()
  const aula = await obterAula(id)
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

  // O dia da matricula e o que a turma considera para a aula, nao o dia em que
  // ela acontece: numa aula remarcada, a matricula de 15/10 nao entra na lista
  // de uma aula que a turma trata como de 16/10 (caso Rafael, 15/10/2026).
  const dataDaAula = String(aula.data_hora_referencia ?? aula.data_hora_inicio).slice(0, 10)
  const novaMatricula = `/matriculas/nova?turma=${aula.turma_id}&inicio=${dataDaAula}&voltar=/agenda/aulas/${aula.id}`

  // Etapa 3: a situacao da aula (e, para a gestora, onde estao cobranca e pagamento).
  const situacao = (await situacoesDasAulas([aula])).get(aula.id)

  const supabase = await clienteServidor()
  const [lista, { data: presencas }, token, { data: daTurma }, links] = await Promise.all([
    listaDaAula(aula.id),
    supabase
      .from('presencas')
      .select('aluno_id, presente, observacao, conta_pagar_id, aluno:alunos!aluno_id (nome)')
      .eq('aula_id', aula.id),
    tokenDaAula(aula.id),
    // Etapa 2 (29/10/2026): o professor da aula, que pode diferir do atual da turma.
    supabase
      .from('aulas')
      .select('professor:professores!professor_id (nome, telefone)')
      .eq('id', aula.id)
      .maybeSingle(),
    // Pedido de 16/10/2026: o link da aula online sai daqui, aluno por aluno.
    ehGestora ? linksDaAula(aula.id) : null,
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
          {situacao && (
            <span
              className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-medium ${pilulaDaSituacao(situacao.principal)}`}
            >
              {situacao.principal}
            </span>
          )}
          {ehGestora && situacao?.cobranca && (
            <Selo tom={situacao.cobranca === 'Recebida' ? 'ativo' : 'neutro'}>{situacao.cobranca}</Selo>
          )}
          {ehGestora && situacao?.pagamento && (
            <Selo tom={situacao.pagamento === 'Paga' ? 'ativo' : 'neutro'}>
              {situacao.pagamento === 'Paga' ? 'Professor pago' : 'Em pagamento'}
            </Selo>
          )}
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
                <li
                  key={m.aluno_id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3"
                >
                  <span className="flex items-center gap-3">
                    <Link
                      href={`/cadastros/alunos/${m.aluno_id}`}
                      className="font-medium text-destaque hover:underline"
                    >
                      {m.nome}
                    </Link>
                    {m.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-x-5">
                    {links && (
                      <EnviarLink
                        aulaId={aula.id}
                        alunoId={m.aluno_id}
                        destinos={links.get(m.aluno_id) ?? []}
                      />
                    )}
                    {/* R2: registrar aviso previo, antes de a aula acontecer. */}
                    {ehGestora && aula.status === 'Agendada' && (
                      <AvisarFalta alunoId={m.aluno_id} aulaId={aula.id} nome={m.nome} />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-tinta-suave">
              A chamada ainda não foi registrada. Gere o link e envie ao professor.
            </p>
          </>
        )}

        {/* So antes da chamada: depois dela, o aluno novo ficaria sem presenca
            nem falta. A aula avulsa e uma matricula de um dia so, cobrada como
            uma aula da turma e sem boas-vindas (mandaBoasVindas). */}
        {ehGestora && aula.status === 'Agendada' && (
          <div className="mt-4 flex flex-wrap gap-3 border-t border-borda/60 pt-4">
            <BotaoLink href={`${novaMatricula}&fim=${dataDaAula}`} aparencia="secundario">
              Incluir aluno só nesta aula
            </BotaoLink>
            <BotaoLink href={novaMatricula} aparencia="secundario">
              Matricular aluno na turma
            </BotaoLink>
          </div>
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

      {/* Etapa 6a: a previa vale tambem para a aula dada (corrigir o professor, decisao 7). */}
      {ehGestora && aula.status !== 'Excluída' && (
        <div>
          <BotaoLink href={`/turmas/${aula.turma_id}/mudar?aula=${aula.id}&escopo=esta`} aparencia="secundario">
            Prévia de mudança
          </BotaoLink>
        </div>
      )}

      {!noPainel && (
        <Link href="/agenda" className="text-destaque hover:underline">
          ← Voltar para a agenda
        </Link>
      )}
    </div>
  )
}
