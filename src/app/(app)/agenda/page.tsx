import Link from 'next/link'
import { after } from 'next/server'
import {
  conflitosDeFeriado,
  conflitosDeRecesso,
  listarAulas,
  sincronizarAulas,
} from '@/dados/aulas'
import { clienteServidor } from '@/dados/cliente'
import { exigirSessao } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { CalendarioMes, type AulaDoCalendario } from './CalendarioMes'
import { VisaoSemana } from './VisaoSemana'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarDias(isoData: string, dias: number): string {
  const d = new Date(`${isoData}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Domingo da semana que contem a data. */
function domingoDa(isoData: string): string {
  const d = new Date(`${isoData}T12:00:00Z`)
  return somarDias(isoData, -d.getUTCDay())
}

/**
 * Resolve o periodo exibido e os links de navegacao, para as duas vistas.
 * A vista de semana carrega os dias vizinhos junto, porque a semana pode
 * atravessar a virada do mes.
 */
function contexto(vista: 'mes' | 'semana', data: string | undefined, hoje: string) {
  if (vista === 'semana') {
    const inicio = domingoDa(data ?? hoje)
    const fim = somarDias(inicio, 6)
    const dIni = new Date(`${inicio}T12:00:00Z`)
    const dFim = new Date(`${fim}T12:00:00Z`)

    const mesmoMes = dIni.getUTCMonth() === dFim.getUTCMonth()
    const rotulo = mesmoMes
      ? `${dIni.getUTCDate()} a ${dFim.getUTCDate()} de ${dFim.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
      : `${dIni.getUTCDate()} de ${dIni.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' })} a ${dFim.getUTCDate()} de ${dFim.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`

    return {
      de: inicio,
      ate: fim,
      inicioSemana: inicio,
      rotulo,
      anterior: `/agenda?vista=semana&data=${somarDias(inicio, -7)}`,
      seguinte: `/agenda?vista=semana&data=${somarDias(inicio, 7)}`,
      mesReferencia: inicio.slice(0, 7),
    }
  }

  const base = new Date(`${(data ?? hoje).slice(0, 7)}-01T12:00:00`)
  const ano = base.getFullYear()
  const m = base.getMonth()
  const anterior = new Date(ano, m - 1, 1)
  const seguinte = new Date(ano, m + 1, 1)

  return {
    de: iso(new Date(ano, m, 1)),
    ate: iso(new Date(ano, m + 1, 0)),
    inicioSemana: '',
    rotulo: base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    anterior: `/agenda?data=${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`,
    seguinte: `/agenda?data=${seguinte.getFullYear()}-${String(seguinte.getMonth() + 1).padStart(2, '0')}`,
    mesReferencia: `${ano}-${String(m + 1).padStart(2, '0')}`,
  }
}

const LEGENDA = [
  { rotulo: 'Agendada', classe: 'bg-destaque-suave text-destaque-forte' },
  { rotulo: 'Realizada', classe: 'bg-apoio-suave text-apoio' },
  { rotulo: 'Cancelada', classe: 'bg-superficie-2 text-tinta-suave' },
  { rotulo: 'Feriado', classe: 'bg-alerta-suave text-alerta' },
]

export default async function PaginaAgenda({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; data?: string; mes?: string }>
}) {
  const sessao = await exigirSessao()
  const params = await searchParams
  const vista = params.vista === 'semana' ? 'semana' : 'mes'

  const agoraData = new Date()
  const hoje = iso(agoraData)
  // `mes` continua aceito para nao quebrar links antigos.
  const ctx = contexto(vista, params.data ?? params.mes, hoje)

  // Sincronizacao sob demanda ao abrir a agenda (Operacionais 4.3), rodando
  // DEPOIS que a resposta ja foi enviada.
  //
  // Sincronizar antes de renderizar custava 800ms — duas idas ao banco em
  // serie — numa tela que a gestora abre o tempo todo. E sincronizar nunca foi
  // pre-requisito para ver o mes: e manutencao. Com `after`, a pagina aparece
  // na hora e o ajuste acontece em seguida; o que entrar aparece na proxima
  // abertura. Turma recem-criada nao espera por isso: o proprio salvamento da
  // turma ja materializa as aulas.
  if (sessao.papel === 'gestora') {
    after(async () => {
      try {
        await sincronizarAulas(ctx.de, ctx.ate)
      } catch (e) {
        console.error('falha ao sincronizar a agenda:', e)
      }
    })
  }

  const supabase = await clienteServidor()
  const [aulas, conflitos, recessos, { data: feriadosDoPeriodo }] = await Promise.all([
    listarAulas({
      de: ctx.de,
      ate: ctx.ate,
      professorId: sessao.papel === 'professor' ? (sessao.professorId ?? -1) : undefined,
    }),
    sessao.papel === 'gestora' ? conflitosDeFeriado(ctx.de, ctx.ate) : Promise.resolve([]),
    sessao.papel === 'gestora' ? conflitosDeRecesso(ctx.de, ctx.ate) : Promise.resolve([]),
    supabase.from('feriados').select('data, nome').gte('data', ctx.de).lte('data', ctx.ate),
  ])

  // Somente dados simples atravessam a fronteira para os componentes de vista.
  const paraCalendario: AulaDoCalendario[] = aulas.map((a) => ({
    id: a.id,
    data_hora_inicio: a.data_hora_inicio,
    data_hora_fim: a.data_hora_fim,
    status: a.status,
    turma_nome: a.turma?.nome ?? 'Turma',
  }))

  const feriados = Object.fromEntries(
    (feriadosDoPeriodo ?? []).map((f) => [f.data, f.nome as string]),
  )

  const abas = [
    { rotulo: 'Semana', href: '/agenda?vista=semana', ativa: vista === 'semana' },
    { rotulo: 'Mês', href: '/agenda', ativa: vista === 'mes' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl first-letter:uppercase">{ctx.rotulo}</h1>
          <p className="mt-1 text-tinta-suave">
            {aulas.length} {aulas.length === 1 ? 'aula' : 'aulas'}{' '}
            {vista === 'semana' ? 'na semana' : 'no mês'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Formato da agenda"
            className="flex rounded-campo border border-borda bg-superficie p-1"
          >
            {abas.map((aba) => (
              <Link
                key={aba.rotulo}
                href={aba.href}
                role="tab"
                aria-selected={aba.ativa}
                className={`flex min-h-[36px] items-center rounded-md px-4 text-sm font-medium transition-colors ${
                  aba.ativa
                    ? 'bg-destaque text-white'
                    : 'text-tinta-suave hover:text-tinta'
                }`}
              >
                {aba.rotulo}
              </Link>
            ))}
          </div>

          <nav aria-label="Navegar no tempo" className="flex items-center gap-1">
            <Link
              href={ctx.anterior}
              aria-label={vista === 'semana' ? 'Semana anterior' : 'Mês anterior'}
              className="flex size-11 items-center justify-center rounded-campo border border-borda bg-superficie text-lg transition-colors hover:border-destaque/40 hover:text-destaque"
            >
              ‹
            </Link>
            <Link
              href={vista === 'semana' ? '/agenda?vista=semana' : '/agenda'}
              className="flex min-h-[44px] items-center rounded-campo border border-borda bg-superficie px-4 font-medium transition-colors hover:border-destaque/40 hover:text-destaque"
            >
              Hoje
            </Link>
            <Link
              href={ctx.seguinte}
              aria-label={vista === 'semana' ? 'Próxima semana' : 'Próximo mês'}
              className="flex size-11 items-center justify-center rounded-campo border border-borda bg-superficie text-lg transition-colors hover:border-destaque/40 hover:text-destaque"
            >
              ›
            </Link>
          </nav>
        </div>
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

      {/* C2: recesso e do calendario de UMA escola — por isso separado do
          alerta de feriado, que vale para todo mundo. */}
      {recessos.length > 0 && (
        <Cartao className="border-alerta/30 bg-alerta-suave">
          <h2 className="text-lg text-alerta">Aulas em recesso escolar</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Estas aulas caem dentro de um recesso da escola da turma. Decida se cancela,
            remarca ou mantém.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {recessos.map((c) => (
              <li key={c.aulaId}>
                <Link
                  href={`/agenda/aulas/${c.aulaId}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {c.data.split('-').reverse().join('/')} — {c.recesso}
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {vista === 'semana' ? (
        <VisaoSemana
          inicioSemana={ctx.inicioSemana}
          aulas={paraCalendario}
          feriados={feriados}
          hoje={hoje}
          agora={{ hora: agoraData.getHours(), minuto: agoraData.getMinutes() }}
        />
      ) : (
        <CalendarioMes
          mes={ctx.mesReferencia}
          aulas={paraCalendario}
          feriados={feriados}
          hoje={hoje}
        />
      )}

      {aulas.length === 0 ? (
        <EstadoVazio
          titulo={`Nenhuma aula ${vista === 'semana' ? 'nesta semana' : 'neste mês'}`}
          descricao="As aulas são geradas a partir dos dias e horários cadastrados em cada turma. Use as setas acima para procurar em outro período."
        />
      ) : (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-tinta-suave">
          {LEGENDA.map((l) => (
            <li key={l.rotulo} className="flex items-center gap-1.5">
              <span className={`inline-block size-3 rounded ${l.classe}`} />
              {l.rotulo}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
