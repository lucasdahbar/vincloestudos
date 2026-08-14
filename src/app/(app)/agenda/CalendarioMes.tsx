import Link from 'next/link'

export interface AulaDoCalendario {
  id: number
  data_hora_inicio: string
  data_hora_fim: string
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
  turma_nome: string
}

interface Props {
  /** Mes em ISO, AAAA-MM. */
  mes: string
  aulas: AulaDoCalendario[]
  /** Feriados do mes, por data ISO. */
  feriados: Record<string, string>
  /** Data de hoje em ISO, resolvida no servidor para nao divergir do cliente. */
  hoje: string
}

const CABECALHO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Cores por status. Realizada em verde, cancelada apagada, feriado em alerta. */
const ESTILO_AULA: Record<AulaDoCalendario['status'], string> = {
  Agendada: 'bg-destaque-suave text-destaque-forte hover:bg-destaque hover:text-white',
  Realizada: 'bg-apoio-suave text-apoio hover:bg-apoio hover:text-white',
  Cancelada: 'bg-superficie-2 text-tinta-suave line-through hover:bg-borda',
  Feriado: 'bg-alerta-suave text-alerta hover:bg-alerta hover:text-white',
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Semanas do mes, cada uma com 7 dias. Preenche as pontas com dias vizinhos. */
function semanasDoMes(mes: string): { data: string; doMes: boolean }[][] {
  const [ano, m] = mes.split('-').map(Number)
  const primeiro = new Date(Date.UTC(ano, m - 1, 1))
  const inicio = new Date(primeiro)
  inicio.setUTCDate(inicio.getUTCDate() - inicio.getUTCDay())

  const semanas: { data: string; doMes: boolean }[][] = []
  const cursor = new Date(inicio)

  // Sempre 6 semanas: a altura da grade nao muda ao trocar de mes, o que evita
  // o layout "pular" na navegacao.
  for (let s = 0; s < 6; s++) {
    const semana: { data: string; doMes: boolean }[] = []
    for (let d = 0; d < 7; d++) {
      semana.push({ data: iso(cursor), doMes: cursor.getUTCMonth() === m - 1 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    semanas.push(semana)
  }

  return semanas
}

function Chip({ aula }: { aula: AulaDoCalendario }) {
  return (
    <Link
      href={`/agenda/aulas/${aula.id}`}
      title={`${aula.data_hora_inicio.slice(11, 16)} — ${aula.turma_nome} (${aula.status})`}
      className={`block truncate rounded-md px-1.5 py-1 text-xs leading-tight transition-colors ${ESTILO_AULA[aula.status]}`}
    >
      <span className="font-semibold">{aula.data_hora_inicio.slice(11, 16)}</span>{' '}
      <span className="opacity-90">{aula.turma_nome}</span>
    </Link>
  )
}

export function CalendarioMes({ mes, aulas, feriados, hoje }: Props) {
  const porDia = new Map<string, AulaDoCalendario[]>()
  for (const aula of aulas) {
    const dia = aula.data_hora_inicio.slice(0, 10)
    porDia.set(dia, [...(porDia.get(dia) ?? []), aula])
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => a.data_hora_inicio.localeCompare(b.data_hora_inicio))
  }

  const semanas = semanasDoMes(mes)

  return (
    <>
      {/* Grade do mes: so a partir de sm. Em tela pequena, 7 colunas ficam
          ilegiveis, entao a lista abaixo assume. */}
      <div className="hidden overflow-hidden rounded-cartao border border-borda bg-superficie sm:block">
        <div className="grid grid-cols-7 border-b border-borda bg-superficie-2/60">
          {CABECALHO.map((dia) => (
            <div
              key={dia}
              className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-tinta-suave"
            >
              {dia}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {semanas.flat().map(({ data, doMes }, i) => {
            const doDia = porDia.get(data) ?? []
            const feriado = feriados[data]
            const ehHoje = data === hoje

            return (
              <div
                key={data}
                className={`min-h-[7rem] border-b border-r border-borda/60 p-1.5 last:border-r-0 ${
                  i % 7 === 6 ? 'border-r-0' : ''
                } ${doMes ? '' : 'bg-superficie-2/30'}`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-full text-sm ${
                      ehHoje
                        ? 'bg-destaque font-semibold text-white'
                        : doMes
                          ? 'text-tinta'
                          : 'text-tinta-suave/50'
                    }`}
                  >
                    {Number(data.slice(8, 10))}
                  </span>
                  {feriado && (
                    <span
                      title={feriado}
                      className="truncate rounded bg-alerta-suave px-1 text-[0.65rem] text-alerta"
                    >
                      {feriado}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  {doDia.map((aula) => (
                    <Chip key={aula.id} aula={aula} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Celular: lista por dia, so os dias que tem aula. */}
      <div className="flex flex-col gap-4 sm:hidden">
        {[...porDia.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dia, doDia]) => (
            <section key={dia}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-tinta-suave">
                {new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                })}
                {dia === hoje && (
                  <span className="rounded-full bg-destaque px-2 py-0.5 text-xs text-white">
                    hoje
                  </span>
                )}
                {feriados[dia] && (
                  <span className="rounded bg-alerta-suave px-1.5 text-xs text-alerta">
                    {feriados[dia]}
                  </span>
                )}
              </h2>
              <ul className="flex flex-col gap-2">
                {doDia.map((aula) => (
                  <li key={aula.id}>
                    <Link
                      href={`/agenda/aulas/${aula.id}`}
                      className="flex items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie px-4 py-3 shadow-sutil"
                    >
                      {/* `truncate` nao funciona em elemento inline: overflow nao
                          se aplica a caixa inline, e o span estica ate caber o
                          texto inteiro. Um nome de turma longo empurrava o
                          documento para 631px, o navegador encolhia a pagina
                          para caber, e a barra de navegacao fixa saia da tela. */}
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="shrink-0 font-medium">
                          {aula.data_hora_inicio.slice(11, 16)}
                        </span>
                        <span className="min-w-0 truncate text-sm text-tinta-suave">
                          {aula.turma_nome}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ESTILO_AULA[aula.status].split(' hover:')[0]}`}
                      >
                        {aula.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </>
  )
}
