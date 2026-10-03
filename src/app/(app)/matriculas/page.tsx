import Link from 'next/link'
import { listarMatriculas } from '@/dados/matriculas'
import { exigirGestora } from '@/dados/sessao'
import { opcoesDeTurma, turmasResumidas } from '@/dados/turmas'
import { comoId, comoOpcao, comoTexto } from '@/dominio/filtros'
import { STATUS_MATRICULA } from '@/dominio/tipos'
import { BotaoLink } from '@/ui/Botao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Filtros, deOpcoes, deValores } from '@/ui/Filtros'
import { Selo } from '@/ui/Selo'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

const CAMPOS_FILTRO = ['busca', 'status', 'tipo', 'turma', 'professor', 'materia', 'escola']
const TIPOS = ['regular', 'reposicao'] as const

export default async function PaginaMatriculas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirGestora()
  const params = await searchParams
  const filtrando = CAMPOS_FILTRO.some((c) => params[c])

  // Professor, matéria e escola são da turma: viram a lista de turmas que
  // passam, e a matrícula filtra por ela.
  const daTurma = {
    professorId: comoId(params.professor),
    materiaId: comoId(params.materia),
    escolaId: comoId(params.escola),
  }
  const filtraPelaTurma = Object.values(daTurma).some(Boolean)
  const tipo = comoOpcao(params.tipo, TIPOS)

  const [opcoes, turmas, matriculas] = await Promise.all([
    opcoesDeTurma(),
    turmasResumidas(),
    (async () =>
      listarMatriculas({
        busca: comoTexto(params.busca),
        status: comoOpcao(params.status, STATUS_MATRICULA),
        turmaId: comoId(params.turma),
        turmaIds: filtraPelaTurma ? (await turmasResumidas(daTurma)).map((t) => t.id) : undefined,
        reposicao: tipo === undefined ? undefined : tipo === 'reposicao',
      }))(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Matrículas</h1>
          <p className="mt-1 text-tinta-suave">
            {matriculas.length} {matriculas.length === 1 ? 'matrícula' : 'matrículas'}
          </p>
        </div>
        <BotaoLink href="/matriculas/nova">+ Nova matrícula</BotaoLink>
      </header>

      {/* Numa lista de tres, o filtro so ocupa espaco (mesma regra de turmas). */}
      {(matriculas.length > 3 || filtrando) && (
        <Filtros
          busca={{ campo: 'busca', rotulo: 'Aluno', placeholder: 'Nome do aluno' }}
          seletores={[
            { campo: 'status', rotulo: 'Situação', opcoes: deValores(STATUS_MATRICULA), todos: 'Todas' },
            {
              campo: 'tipo',
              rotulo: 'Tipo',
              opcoes: [
                { valor: 'regular', nome: 'Regular' },
                { valor: 'reposicao', nome: 'Reposição' },
              ],
            },
            { campo: 'turma', rotulo: 'Turma', opcoes: deOpcoes(turmas), todos: 'Todas' },
            { campo: 'professor', rotulo: 'Professor', opcoes: deOpcoes(opcoes.professores) },
            { campo: 'materia', rotulo: 'Matéria', opcoes: deOpcoes(opcoes.materias), todos: 'Todas' },
            { campo: 'escola', rotulo: 'Escola', opcoes: deOpcoes(opcoes.escolas), todos: 'Todas' },
          ]}
          total={matriculas.length}
          contagem={{
            um: 'matrícula encontrada',
            varios: 'matrículas encontradas',
            nenhum: 'Nenhuma matrícula com esses filtros.',
          }}
        />
      )}

      {matriculas.length === 0 && filtrando ? null : matriculas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma matrícula ainda"
          descricao="A matrícula liga um aluno a uma turma. É o que faz o aluno entrar nas aulas e nas cobranças."
          acao={<BotaoLink href="/matriculas/nova">+ Nova matrícula</BotaoLink>}
        />
      ) : (
        <>
          {/* Celular: cartao por matricula, para nao precisar rolar de lado. */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {matriculas.map((m) => (
              <li
                key={m.id}
                className="rounded-cartao border border-borda bg-superficie p-4 shadow-sutil"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/cadastros/alunos/${m.aluno_id}`}
                    className="font-medium text-destaque"
                  >
                    {m.aluno?.nome}
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    <Selo tom={m.status === 'Ativa' ? 'ativo' : 'encerrado'}>{m.status}</Selo>
                    {m.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
                  </div>
                </div>
                <Link
                  href={`/turmas/${m.turma_id}`}
                  className="mt-1 block text-sm text-tinta-suave"
                >
                  {m.turma?.nome}
                </Link>
                <p className="mt-2 text-sm text-tinta-tenue">
                  {dataBR(m.data_inicio)}
                  {m.data_fim ? ` até ${dataBR(m.data_fim)}` : ' — em aberto'}
                </p>
              </li>
            ))}
          </ul>

        <div className="hidden overflow-x-auto rounded-cartao border border-borda bg-superficie shadow-sutil sm:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-borda bg-superficie-2/60 text-sm text-tinta-suave">
                <th className="px-5 py-3 font-semibold">Aluno</th>
                <th className="px-5 py-3 font-semibold">Turma</th>
                <th className="px-5 py-3 font-semibold">Início</th>
                <th className="px-5 py-3 font-semibold">Fim</th>
                <th className="px-5 py-3 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {matriculas.map((m) => (
                <tr key={m.id} className="border-b border-borda/60 last:border-0">
                  <td className="px-5 py-4">
                    <Link
                      href={`/cadastros/alunos/${m.aluno_id}`}
                      className="font-medium text-destaque hover:underline"
                    >
                      {m.aluno?.nome}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/turmas/${m.turma_id}`} className="hover:underline">
                      {m.turma?.nome}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{dataBR(m.data_inicio)}</td>
                  <td className="px-5 py-4">{dataBR(m.data_fim)}</td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <Selo tom={m.status === 'Ativa' ? 'ativo' : 'encerrado'}>{m.status}</Selo>
                      {m.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
