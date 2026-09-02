import Link from 'next/link'
import { listarTurmas, opcoesDeTurma } from '@/dados/turmas'
import { exigirSessao } from '@/dados/sessao'
import { nomesDosDias } from '@/dominio/tipos'
import { BotaoLink } from '@/ui/Botao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { FiltrosTurma } from './FiltrosTurma'

/** Numero vindo da URL, ou undefined quando o filtro nao esta aplicado. */
function comoId(valor: string | string[] | undefined): number | undefined {
  const n = Number(Array.isArray(valor) ? valor[0] : valor)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function comoTexto(valor: string | string[] | undefined): string | undefined {
  const t = Array.isArray(valor) ? valor[0] : valor
  return t || undefined
}

export default async function PaginaTurmas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sessao = await exigirSessao()
  const filtros = await searchParams
  const ehGestora = sessao.papel === 'gestora'

  const turmas = await listarTurmas({
    // O professor so enxerga as proprias turmas; o filtro da tela nao pode
    // abrir uma porta para as dos outros.
    ...(ehGestora
      ? { professorId: comoId(filtros.professor) }
      : { professorId: sessao.professorId ?? undefined }),
    status: comoTexto(filtros.status),
    materiaId: comoId(filtros.materia),
    escolaId: comoId(filtros.escola),
    modalidade: comoTexto(filtros.modalidade),
  })

  const opcoes = await opcoesDeTurma()

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

      {/* T2: filtros. So aparecem quando ha turma suficiente para valer a pena
          filtrar — numa lista de tres, o filtro so ocupa espaco. */}
      {(turmas.length > 3 || Object.keys(filtros).length > 0) && (
        <FiltrosTurma
          materias={opcoes.materias}
          escolas={opcoes.escolas}
          professores={ehGestora ? opcoes.professores : []}
          total={turmas.length}
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
                  <h2 className="font-titulo text-lg leading-snug">
                    {turma.nome}
                  </h2>
                  <Selo tom={turma.status === 'Ativa' ? 'ativo' : 'encerrado'}>{turma.status}</Selo>
                </div>
                <dl className="mt-3 flex flex-col gap-1 text-sm text-tinta-suave">
                  <div>{turma.professor?.nome}</div>
                  <div>
                    {turma.tipo_recorrencia === 'Único' && turma.data_unica
                      ? `Aula única em ${turma.data_unica.split('-').reverse().join('/')}`
                      : nomesDosDias(turma.dias_semana)}{' '}
                    · {turma.horario_inicio.slice(0, 5)} às {turma.horario_fim.slice(0, 5)}
                  </div>
                  <div>
                    {turma.alunos_matriculados}{' '}
                    {turma.alunos_matriculados === 1 ? 'aluno matriculado' : 'alunos matriculados'}
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
