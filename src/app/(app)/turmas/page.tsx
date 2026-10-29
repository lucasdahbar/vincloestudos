import Link from 'next/link'
import { after } from 'next/server'
import { fecharTurmasVencidas, listarTurmas, opcoesDeTurma } from '@/dados/turmas'
import { exigirSessao } from '@/dados/sessao'
import { comoId, comoOpcao, deOpcoes, deValores } from '@/dominio/filtros'
import { MODALIDADES } from '@/dominio/tipos'
import { deveOferecerRenovacao, fimRenovado } from '@/dominio/agenda/recorrencia'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { periodoDaTurma, quandoDaTurma } from '@/dominio/turmas/quando'
import { temAulaPelaFrente } from '@/dominio/turmas/lista'
import { BotaoLink } from '@/ui/Botao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Filtros } from '@/ui/Filtros'
import { Selo } from '@/ui/Selo'
import { RenovarTurmas } from './RenovarTurmas'

// Renovar turmas refaz, em `after()`, o evento no Google de cada uma, uma por
// vez. O limite vale para as Server Actions da página.
export const maxDuration = 300

/** Etapa 4: o que a lista mostra. Sem nada, so as series com aula pela frente. */
const MOSTRAR = ['encerradas', 'unicas', 'todas'] as const
const ROTULO_MOSTRAR: Record<(typeof MOSTRAR)[number], string> = {
  encerradas: 'Encerradas',
  unicas: 'Aulas únicas',
  todas: 'Todas',
}

export default async function PaginaTurmas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await exigirSessao()
  const filtros = await searchParams
  const ehGestora = sessao.papel === 'gestora'

  // Etapa 4: a turma que terminou (aula unica que passou, encerramento com
  // data futura que chegou) fecha sozinha, depois da resposta.
  if (ehGestora) {
    after(async () => {
      try {
        await fecharTurmasVencidas()
      } catch (e) {
        console.error('falha ao fechar as turmas vencidas:', e)
      }
    })
  }

  const todas = await listarTurmas({
    // O professor so enxerga as proprias turmas; o filtro da tela nao pode
    // abrir uma porta para as dos outros.
    ...(ehGestora
      ? { professorId: comoId(filtros.professor) }
      : { professorId: sessao.professorId ?? undefined }),
    materiaId: comoId(filtros.materia),
    escolaId: comoId(filtros.escola),
    modalidade: comoOpcao(filtros.modalidade, MODALIDADES),
  })

  const opcoes = await opcoesDeTurma()
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const mostrar = comoOpcao(filtros.mostrar, MOSTRAR)
  const turmas = todas.filter((t) => {
    if (mostrar === 'todas') return true
    if (mostrar === 'unicas') return t.tipo_recorrencia === 'Único'
    if (mostrar === 'encerradas') return t.tipo_recorrencia === 'Recorrente' && !temAulaPelaFrente(t, hoje)
    return temAulaPelaFrente(t, hoje)
  })
  const paraRenovar = ehGestora ? todas.filter((t) => deveOferecerRenovacao(t, hoje)) : []
  const maisCedo = [...paraRenovar].sort((a, b) => (a.data_fim ?? '').localeCompare(b.data_fim ?? ''))[0]
  const novoFim = maisCedo?.data_fim ? fimRenovado(maisCedo.data_fim, hoje) : null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Turmas</h1>
          <p className="mt-1 text-tinta-suave">
            {turmas.length} {turmas.length === 1 ? 'turma' : 'turmas'}
          </p>
        </div>
        {ehGestora && <BotaoLink href="/turmas/nova">+ Nova turma</BotaoLink>}
      </header>

      {paraRenovar.length > 0 && novoFim && (
        <RenovarTurmas
          ids={paraRenovar.map((t) => t.id)}
          ano={novoFim.slice(0, 4)}
          fim={maisCedo.data_fim!.split('-').reverse().join('/')}
        />
      )}

      {/* T2: filtros. So aparecem quando ha turma suficiente para valer a pena
          filtrar — numa lista de tres, o filtro so ocupa espaco. */}
      {(todas.length > 3 || Object.keys(filtros).length > 0) && (
        <Filtros
          seletores={[
            {
              campo: 'mostrar',
              rotulo: 'Mostrar',
              opcoes: MOSTRAR.map((m) => ({ valor: m, nome: ROTULO_MOSTRAR[m] })),
              todos: 'Com aula pela frente',
            },
            { campo: 'materia', rotulo: 'Matéria', opcoes: deOpcoes(opcoes.materias) },
            { campo: 'escola', rotulo: 'Escola', opcoes: deOpcoes(opcoes.escolas) },
            {
              campo: 'professor',
              rotulo: 'Professor',
              opcoes: ehGestora ? deOpcoes(opcoes.professores) : [],
            },
            { campo: 'modalidade', rotulo: 'Modalidade', opcoes: deValores(MODALIDADES) },
          ]}
          total={turmas.length}
          contagem={{
            um: 'turma encontrada',
            varios: 'turmas encontradas',
            nenhum: 'Nenhuma turma com esses filtros.',
          }}
        />
      )}

      {turmas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma turma ainda"
          descricao="Uma turma junta serviço, matéria, ano escolar e professor com dias e horários fixos. É nela que os alunos são matriculados."
          acao={ehGestora && <BotaoLink href="/turmas/nova">+ Nova turma</BotaoLink>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {turmas.map((turma) => (
            <li key={turma.id}>
              <Link
                href={`/turmas/${turma.id}`}
                className="block rounded-cartao border border-borda bg-superficie p-5 shadow-cartao transition-all hover:-translate-y-0.5 hover:border-destaque/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-titulo text-lg leading-snug">{turma.nome}</h2>
                    {/* Etapa 4: o dia e o horario fazem parte do nome, porque
                        duas turmas iguais em horarios diferentes se confundiam. */}
                    <p className="mt-1 font-medium text-destaque-forte">
                      {quandoDaTurma(turma)}–{turma.horario_fim.slice(0, 5)}
                    </p>
                  </div>
                  <Selo tom={turma.status === 'Ativa' ? 'ativo' : 'encerrado'}>{turma.status}</Selo>
                </div>
                <dl className="mt-3 flex flex-col gap-1 text-sm text-tinta-suave">
                  <div>{turma.professor?.nome}</div>
                  {periodoDaTurma(turma) && <div>{periodoDaTurma(turma)}</div>}
                  <div>
                    {turma.alunos_matriculados}{' '}
                    {turma.alunos_matriculados === 1 ? 'aluno matriculado' : 'alunos matriculados'}
                    {(turma.avulsos_marcados ?? 0) > 0 &&
                      ` · ${turma.avulsos_marcados} ${turma.avulsos_marcados === 1 ? 'avulso' : 'avulsos'}`}
                    {(turma.reposicoes_marcadas ?? 0) > 0 &&
                      ` · ${turma.reposicoes_marcadas} em reposição`}
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
