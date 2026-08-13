import Link from 'next/link'
import { listarTurmas } from '@/dados/turmas'
import { exigirSessao } from '@/dados/sessao'
import { nomesDosDias } from '@/dominio/tipos'
import { BotaoLink } from '@/ui/Botao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

export default async function PaginaTurmas() {
  const sessao = await exigirSessao()
  const turmas = await listarTurmas(
    sessao.papel === 'professor' && sessao.professorId
      ? { professorId: sessao.professorId }
      : {},
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Turmas</h1>
          <p className="mt-1 text-tinta-suave">
            {turmas.length} {turmas.length === 1 ? 'turma' : 'turmas'}
          </p>
        </div>
        {sessao.papel === 'gestora' && <BotaoLink href="/turmas/nova">+ Nova turma</BotaoLink>}
      </header>

      {turmas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma turma ainda"
          descricao="Uma turma junta serviço, matéria, ano escolar e professor com dias e horários fixos. É nela que os alunos são matriculados."
          acao={sessao.papel === 'gestora' && <BotaoLink href="/turmas/nova">+ Nova turma</BotaoLink>}
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
                    {nomesDosDias(turma.dias_semana)} · {turma.horario_inicio.slice(0, 5)} às{' '}
                    {turma.horario_fim.slice(0, 5)}
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
