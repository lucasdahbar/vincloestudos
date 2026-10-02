import Link from 'next/link'
import { aulasDoLink, chamadaDaAula } from '@/dados/presenca-professor'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import type { AulaDoProfessor } from '@/dominio/presencas/link-professor'
import { Chamada } from '../../presenca/[token]/Chamada'
import { titulo } from '@/marca'

export const metadata = { title: titulo('Presença') }

// O que o link mostra depende do relogio: a pagina nunca pode vir de cache.
export const dynamic = 'force-dynamic'

// As aulas sao gravadas com o horario de parede como se fosse UTC: formatar em
// UTC mostra o horario da aula, seja qual for o fuso do servidor.
function formatarQuando(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function rotuloDoDia(data: string, hoje: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  const [a, m, d] = hoje.split('-').map(Number)
  const diferenca = (Date.UTC(ano, mes - 1, dia) - Date.UTC(a, m - 1, d)) / 86_400_000
  if (diferenca === 0) return 'Hoje'
  if (diferenca === 1) return 'Amanhã'
  if (diferenca === -1) return 'Ontem'
  return new Date(Date.UTC(ano, mes - 1, dia)).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-cartao border border-borda bg-superficie p-8 text-center">
      <h1 className="font-titulo text-2xl">{titulo}</h1>
      <p className="mt-3 text-tinta-suave">{texto}</p>
    </div>
  )
}

function Voltar({ token }: { token: string }) {
  return (
    <Link
      href={`/p/professor/${token}`}
      className="mb-6 inline-flex min-h-[44px] items-center text-sm text-tinta-suave hover:text-tinta"
    >
      ← Minhas aulas
    </Link>
  )
}

function ListaDeAulas({
  titulo,
  aulas,
  token,
  hoje,
  nota,
}: {
  titulo: string
  aulas: AulaDoProfessor[]
  token: string
  hoje: string
  nota?: string
}) {
  if (aulas.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="font-titulo text-xl">{titulo}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {aulas.map((a) => (
          <li key={a.id}>
            <Link
              href={`/p/professor/${token}?aula=${a.id}`}
              className="block min-h-[44px] rounded-cartao border border-borda bg-superficie p-5 transition-all hover:border-destaque/40 active:scale-[0.99]"
            >
              <span className="font-titulo text-lg">{a.turma_nome}</span>
              <span className="mt-1 block text-sm text-tinta-suave">
                {rotuloDoDia(a.data, hoje)} · {a.horario_inicio} às {a.horario_fim}
                {nota && ` · ${nota}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * R1 (Rodada 2): o link pessoal e permanente do professor.
 *
 * Sem `aula` na URL, lista as aulas: as que esperam chamada, as confirmadas de
 * hoje e as dos proximos dias. Com `aula`, abre a chamada — ou, se a aula ainda
 * nao comecou, so a lista de quem vem.
 */
export default async function PaginaLinkDoProfessor({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ aula?: string }>
}) {
  const { token } = await params
  const { aula } = await searchParams

  if (aula) {
    const leitura = await chamadaDaAula(token, Number(aula))
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
        <Voltar token={token} />
        {!leitura.ok ? (
          <Aviso titulo="Não foi possível abrir" texto={leitura.motivo} />
        ) : leitura.chamada.modo === 'confirmada' ? (
          <Aviso
            titulo={leitura.chamada.turma_nome}
            texto="Esta chamada já foi confirmada. Peça à gestora para reabrir, se precisar corrigir."
          />
        ) : leitura.chamada.modo === 'consultar' ? (
          <div className="flex flex-col gap-6">
            <header>
              <h1 className="font-titulo text-2xl leading-snug">{leitura.chamada.turma_nome}</h1>
              <p className="mt-1 text-tinta-suave">{formatarQuando(leitura.chamada.data_hora_inicio)}</p>
            </header>
            {leitura.chamada.alunos.length === 0 ? (
              <p className="text-tinta-suave">Nenhum aluno previsto para esta aula.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {leitura.chamada.alunos.map((a) => (
                  <li
                    key={a.aluno_id}
                    className="rounded-cartao border border-borda bg-superficie p-4 font-medium"
                  >
                    {a.nome}
                    {a.flag_reposicao && (
                      <span className="ml-2 rounded-full bg-alerta-suave px-2 py-0.5 text-sm text-alerta">
                        reposição
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-tinta-suave">
              A chamada abre uma hora antes do início, neste mesmo link.
            </p>
          </div>
        ) : leitura.chamada.alunos.length === 0 ? (
          <Aviso
            titulo={leitura.chamada.turma_nome}
            texto="Nenhum aluno para marcar nesta aula. Quem avisou que não vem já está em Reposições."
          />
        ) : (
          <Chamada
            token={token}
            aulaId={leitura.chamada.aula_id}
            turmaNome={leitura.chamada.turma_nome}
            quando={formatarQuando(leitura.chamada.data_hora_inicio)}
            alunos={leitura.chamada.alunos}
            voltarHref={`/p/professor/${token}`}
          />
        )}
      </main>
    )
  }

  const leitura = await aulasDoLink(token)

  if (!leitura.ok) {
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
        <Aviso titulo="Link indisponível" texto={leitura.motivo} />
      </main>
    )
  }

  const { professor, tela } = leitura
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const primeiroNome = professor.nome.split(' ')[0]

  if (tela.pendentes.length + tela.confirmadasHoje.length + tela.proximas.length === 0) {
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
        <Aviso
          titulo={`Olá, ${primeiroNome}!`}
          texto="Nenhuma aula por agora. Este link é sempre o mesmo, para todas as suas turmas — as próximas aulas aparecem aqui."
        />
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
      <h1 className="font-titulo text-2xl">Olá, {primeiroNome}!</h1>
      <p className="mt-2 text-tinta-suave">
        {tela.pendentes.length === 0
          ? 'Nenhuma chamada pendente. Abaixo, as suas próximas aulas.'
          : 'Toque numa aula para marcar a presença.'}
      </p>

      <ListaDeAulas titulo="Para marcar presença" aulas={tela.pendentes} token={token} hoje={hoje} />
      <ListaDeAulas
        titulo="Confirmadas hoje"
        aulas={tela.confirmadasHoje}
        token={token}
        hoje={hoje}
        nota="chamada confirmada"
      />
      <ListaDeAulas titulo="Próximas aulas" aulas={tela.proximas} token={token} hoje={hoje} />
    </main>
  )
}
