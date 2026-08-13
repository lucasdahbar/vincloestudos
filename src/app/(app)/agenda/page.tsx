import Link from 'next/link'
import { conflitosDeFeriado, listarAulas } from '@/dados/aulas'
import { exigirSessao } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

/** Primeiro e último dia do mês informado (ou do mês corrente). */
function intervaloDoMes(mes?: string) {
  const base = mes ? new Date(`${mes}-01T00:00:00`) : new Date()
  const de = new Date(base.getFullYear(), base.getMonth(), 1)
  const ate = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { de: iso(de), ate: iso(ate), rotulo: base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
}

const TOM: Record<string, 'ativo' | 'encerrado' | 'alerta' | 'neutro'> = {
  Agendada: 'neutro',
  Realizada: 'ativo',
  Cancelada: 'encerrado',
  Feriado: 'alerta',
}

export default async function PaginaAgenda({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const sessao = await exigirSessao()
  const { mes } = await searchParams
  const { de, ate, rotulo } = intervaloDoMes(mes)

  const [aulas, conflitos] = await Promise.all([
    listarAulas({
      de,
      ate,
      professorId: sessao.papel === 'professor' ? (sessao.professorId ?? -1) : undefined,
    }),
    sessao.papel === 'gestora' ? conflitosDeFeriado(de, ate) : Promise.resolve([]),
  ])

  const porDia = new Map<string, typeof aulas>()
  for (const aula of aulas) {
    const dia = aula.data_hora_inicio.slice(0, 10)
    porDia.set(dia, [...(porDia.get(dia) ?? []), aula])
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl capitalize">{rotulo}</h1>
        <p className="mt-1 text-tinta-suave">
          {aulas.length} {aulas.length === 1 ? 'aula' : 'aulas'} no mês
        </p>
      </header>

      {conflitos.length > 0 && (
        <Cartao className="border-alerta/30 bg-alerta-suave">
          <h2 className="text-lg text-alerta">Aulas em feriado</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Estas aulas caem em feriado. Decida se cancela, remarca ou mantém — o sistema não
            muda nada sozinho.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {conflitos.map((c) => (
              <li key={c.aulaId}>
                <Link
                  href={`/agenda/aulas/${c.aulaId}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {c.data.split('-').reverse().join('/')} — {c.feriado}
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {aulas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma aula neste mês"
          descricao="As aulas são geradas a partir dos dias e horários cadastrados em cada turma. Rode a sincronização para materializá-las."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {[...porDia.entries()].map(([dia, doDia]) => (
            <section key={dia}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-tinta-suave">
                {new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                })}
              </h2>
              <ul className="flex flex-col gap-2">
                {doDia.map((aula) => (
                  <li key={aula.id}>
                    <Link
                      href={`/agenda/aulas/${aula.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie px-5 py-4 transition-all hover:-translate-y-0.5 hover:border-destaque/40"
                    >
                      <span>
                        <span className="font-medium">
                          {aula.data_hora_inicio.slice(11, 16)}
                        </span>
                        <span className="ml-3 text-tinta-suave">{aula.turma?.nome}</span>
                      </span>
                      <Selo tom={TOM[aula.status]}>{aula.status}</Selo>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
