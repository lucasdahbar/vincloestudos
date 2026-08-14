import Link from 'next/link'
import { listarCobrancas } from '@/dados/cobrancas'
import { listarAulas } from '@/dados/aulas'
import { listarPendencias } from '@/dados/reposicoes'
import { exigirSessao } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'

export default async function PaginaInicial() {
  const sessao = await exigirSessao()
  const hoje = new Date().toISOString().slice(0, 10)
  const ehGestora = sessao.papel === 'gestora'

  const [aulasHoje, pendencias, cobrancas] = await Promise.all([
    listarAulas({
      de: hoje,
      ate: hoje,
      professorId: ehGestora ? undefined : (sessao.professorId ?? -1),
    }),
    ehGestora ? listarPendencias({ status: 'Pendente' }) : Promise.resolve([]),
    ehGestora ? listarCobrancas() : Promise.resolve([]),
  ])

  const emAberto = cobrancas.filter((c) => c.status !== 'Rascunho' && c.valor_total - c.recebido > 0)
  const aReceber = emAberto.reduce((s, c) => s + (c.valor_total - c.recebido), 0)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Olá, {sessao.nome}</h1>
        <p className="mt-1 text-tinta-suave">
          {new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      <Cartao>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg">Aulas de hoje</h2>
          <Link href="/agenda" className="text-sm text-destaque hover:underline">
            ver agenda
          </Link>
        </div>

        {aulasHoje.length === 0 ? (
          <p className="text-tinta-suave">Nenhuma aula hoje.</p>
        ) : (
          <ul className="divide-y divide-borda/60">
            {aulasHoje.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <Link href={`/agenda/aulas/${a.id}`} className="hover:underline">
                  <span className="font-medium">{a.data_hora_inicio.slice(11, 16)}</span>
                  <span className="ml-3 text-tinta-suave">{a.turma?.nome}</span>
                </Link>
                <Selo tom={a.status === 'Realizada' ? 'ativo' : 'neutro'}>{a.status}</Selo>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {ehGestora && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/reposicoes">
            <Cartao className="h-full transition-all hover:-translate-y-0.5 hover:border-destaque/40">
              <p className="text-sm text-tinta-suave">Reposições a agendar</p>
              <p className="mt-1 font-titulo text-3xl">{pendencias.length}</p>
              {pendencias.length > 0 && (
                <p className="mt-2 text-sm text-alerta">
                  {pendencias
                    .slice(0, 3)
                    .map((p) => p.aluno?.nome)
                    .join(', ')}
                  {pendencias.length > 3 ? '…' : ''}
                </p>
              )}
            </Cartao>
          </Link>

          <Link href="/recebimentos">
            <Cartao className="h-full transition-all hover:-translate-y-0.5 hover:border-destaque/40">
              <p className="text-sm text-tinta-suave">A receber</p>
              <p className="mt-1 font-titulo text-3xl">{formatarBRL(aReceber)}</p>
              <p className="mt-2 text-sm text-tinta-suave">
                {emAberto.length} cobrança(s) em aberto
              </p>
            </Cartao>
          </Link>
        </div>
      )}
    </div>
  )
}
