import Link from 'next/link'
import { listarMatriculas } from '@/dados/matriculas'
import { exigirGestora } from '@/dados/sessao'
import { BotaoLink } from '@/ui/Botao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export default async function PaginaMatriculas() {
  await exigirGestora()
  const matriculas = await listarMatriculas()

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

      {matriculas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma matrícula ainda"
          descricao="A matrícula liga um aluno a uma turma. É o que faz o aluno entrar nas aulas e nas cobranças."
          acao={<BotaoLink href="/matriculas/nova">+ Nova matrícula</BotaoLink>}
        />
      ) : (
        <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
          <table className="w-full min-w-[40rem] border-collapse text-left">
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
      )}
    </div>
  )
}
