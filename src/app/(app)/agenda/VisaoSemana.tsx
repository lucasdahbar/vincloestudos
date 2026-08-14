import Link from 'next/link'
import type { AulaDoCalendario } from './CalendarioMes'

interface Props {
  /** Domingo da semana, em ISO. */
  inicioSemana: string
  aulas: AulaDoCalendario[]
  feriados: Record<string, string>
  hoje: string
  /** Hora e minuto atuais, resolvidos no servidor. Nulo se hoje nao esta na semana. */
  agora: { hora: number; minuto: number } | null
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Altura de uma hora na grade, em rem. Define a escala vertical inteira. */
const ALTURA_HORA = 3.5

const ESTILO: Record<AulaDoCalendario['status'], string> = {
  Agendada: 'bg-destaque-suave text-destaque-forte border-destaque/30 hover:bg-destaque hover:text-white',
  Realizada: 'bg-apoio-suave text-apoio border-apoio/30 hover:bg-apoio hover:text-white',
  Cancelada: 'bg-superficie-2 text-tinta-suave border-borda line-through',
  Feriado: 'bg-alerta-suave text-alerta border-alerta/30',
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function VisaoSemana({ inicioSemana, aulas, feriados, hoje, agora }: Props) {
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${inicioSemana}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const daSemana = aulas.filter((a) => dias.includes(a.data_hora_inicio.slice(0, 10)))

  // A faixa de horas se ajusta aos dados: mostrar 00h–23h deixaria a grade
  // quase toda vazia e obrigaria a rolar para achar as aulas.
  const inicios = daSemana.map((a) => minutos(a.data_hora_inicio.slice(11, 16)))
  const fins = daSemana.map((a) => minutos(a.data_hora_fim.slice(11, 16)))
  const primeiraHora = inicios.length ? Math.max(0, Math.floor(Math.min(...inicios) / 60) - 1) : 7
  const ultimaHora = fins.length ? Math.min(24, Math.ceil(Math.max(...fins) / 60) + 1) : 20
  const horas = Array.from({ length: ultimaHora - primeiraHora }, (_, i) => primeiraHora + i)
  const alturaTotal = horas.length * ALTURA_HORA

  /** Posicao vertical de um instante, em rem a partir do topo da grade. */
  const topo = (hhmm: string) => ((minutos(hhmm) - primeiraHora * 60) / 60) * ALTURA_HORA

  const hojeNaSemana = dias.includes(hoje)

  return (
    <>
      {/* Celular: lista por dia. A grade de horas precisa de 44rem para os sete
          dias caberem legiveis; numa tela de 375px isso vira rolagem lateral
          constante. A lista entrega a mesma semana, so que legivel. */}
      <div className="flex flex-col gap-4 sm:hidden">
        {dias.map((dia) => {
          const doDia = daSemana.filter((a) => a.data_hora_inicio.slice(0, 10) === dia)
          if (doDia.length === 0 && !feriados[dia]) return null

          return (
            <section key={dia}>
              <h2 className="rotulo-seco mb-2 flex flex-wrap items-center gap-2">
                {new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', {
                  weekday: 'short',
                  day: '2-digit',
                  month: 'short',
                  timeZone: 'UTC',
                })}
                {dia === hoje && (
                  <span className="rounded-full bg-destaque px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-white">
                    hoje
                  </span>
                )}
                {feriados[dia] && (
                  <span className="rounded bg-alerta-suave px-1.5 py-0.5 text-xs normal-case tracking-normal text-alerta">
                    {feriados[dia]}
                  </span>
                )}
              </h2>

              {doDia.length === 0 ? (
                <p className="text-sm text-tinta-tenue">Sem aula.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {doDia
                    .slice()
                    .sort((a, b) => a.data_hora_inicio.localeCompare(b.data_hora_inicio))
                    .map((aula) => (
                      <li key={aula.id}>
                        <Link
                          href={`/agenda/aulas/${aula.id}`}
                          className="flex items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie px-4 py-3 shadow-sutil"
                        >
                          <span className="min-w-0">
                            <span className="font-medium">
                              {aula.data_hora_inicio.slice(11, 16)}–{aula.data_hora_fim.slice(11, 16)}
                            </span>
                            <span className="mt-0.5 block truncate text-sm text-tinta-suave">
                              {aula.turma_nome}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${ESTILO[aula.status].split(' hover:')[0]}`}
                          >
                            {aula.status}
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

    <div className="hidden overflow-x-auto rounded-cartao border border-borda bg-superficie shadow-sutil sm:block">
      <div className="min-w-[44rem]">
        {/* Cabecalho com os dias */}
        <div className="sticky top-0 z-10 grid grid-cols-[3.5rem_repeat(7,1fr)] border-b border-borda bg-superficie-2/80 backdrop-blur">
          <div />
          {dias.map((dia) => {
            const ehHoje = dia === hoje
            return (
              <div key={dia} className="border-l border-borda/60 px-1 py-2 text-center">
                <div className="text-xs uppercase tracking-wider text-tinta-suave">
                  {DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}
                </div>
                <div
                  className={`mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm ${
                    ehHoje ? 'bg-destaque font-semibold text-white' : 'text-tinta'
                  }`}
                >
                  {Number(dia.slice(8, 10))}
                </div>
                {feriados[dia] && (
                  <div
                    title={feriados[dia]}
                    className="mt-0.5 truncate rounded bg-alerta-suave px-1 text-[0.65rem] text-alerta"
                  >
                    {feriados[dia]}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Grade de horas */}
        <div
          className="relative grid grid-cols-[3.5rem_repeat(7,1fr)]"
          style={{ height: `${alturaTotal}rem` }}
        >
          {/* Coluna das horas */}
          <div className="relative">
            {horas.map((h, i) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-xs text-tinta-suave"
                style={{ top: `${i * ALTURA_HORA}rem` }}
              >
                {i > 0 && `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {dias.map((dia) => {
            const doDia = daSemana.filter((a) => a.data_hora_inicio.slice(0, 10) === dia)

            return (
              <div key={dia} className="relative border-l border-borda/60">
                {/* Linhas de hora */}
                {horas.map((h, i) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-borda/40"
                    style={{ top: `${i * ALTURA_HORA}rem` }}
                  />
                ))}

                {/* Linha do agora */}
                {hojeNaSemana && dia === hoje && agora && (
                  <div
                    className="absolute inset-x-0 z-20 flex items-center"
                    style={{
                      top: `${((agora.hora * 60 + agora.minuto - primeiraHora * 60) / 60) * ALTURA_HORA}rem`,
                    }}
                  >
                    <span className="size-2 shrink-0 rounded-full bg-erro" />
                    <span className="h-px flex-1 bg-erro" />
                  </div>
                )}

                {/* Aulas, posicionadas e dimensionadas pelo horario */}
                {doDia.map((aula) => {
                  const ini = aula.data_hora_inicio.slice(11, 16)
                  const fim = aula.data_hora_fim.slice(11, 16)
                  const altura = Math.max(
                    1.6,
                    ((minutos(fim) - minutos(ini)) / 60) * ALTURA_HORA,
                  )

                  return (
                    <Link
                      key={aula.id}
                      href={`/agenda/aulas/${aula.id}`}
                      title={`${ini} às ${fim} — ${aula.turma_nome} (${aula.status})`}
                      className={`absolute inset-x-0.5 z-10 overflow-hidden rounded-md border px-1.5 py-1 text-xs leading-tight transition-colors ${ESTILO[aula.status]}`}
                      style={{ top: `${topo(ini)}rem`, height: `${altura}rem` }}
                    >
                      <span className="block font-semibold">{ini}</span>
                      <span className="block truncate opacity-90">{aula.turma_nome}</span>
                    </Link>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
    </>
  )
}
