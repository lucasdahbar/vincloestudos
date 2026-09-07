import Link from 'next/link'
import { aulasDoLink, chamadaDaAula } from '@/dados/presenca-professor'
import { Chamada } from '../../presenca/[token]/Chamada'
import { titulo } from '@/marca'

export const metadata = { title: titulo('Presença') }

// A janela do link depende do relogio: a pagina nunca pode vir de cache.
export const dynamic = 'force-dynamic'

function formatarQuando(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
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

/**
 * R1 (Rodada 2): o link pessoal e permanente do professor.
 *
 * Sem `aula` na URL, ele resolve sozinho qual e a aula do momento. Com `aula`,
 * o professor escolheu na lista curta — o caso de duas turmas no mesmo horario.
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
        {!leitura.ok ? (
          <Aviso titulo="Não foi possível abrir" texto={leitura.motivo} />
        ) : leitura.chamada.ja_registrada ? (
          <Aviso
            titulo={leitura.chamada.turma_nome}
            texto="Esta chamada já foi confirmada. Peça à gestora para reabrir, se precisar corrigir."
          />
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

  if (tela.tipo === 'nenhuma') {
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
        <Aviso
          titulo={`Olá, ${professor.nome.split(' ')[0]}!`}
          texto="Nenhuma aula por agora. Abra este mesmo link na hora da sua próxima aula — ele é sempre o mesmo, para todas as suas turmas."
        />
      </main>
    )
  }

  // Uma aula so: nao faz sentido pedir para o professor clicar de novo no unico
  // item de uma lista de um.
  if (tela.tipo === 'uma') {
    const leituraDaAula = await chamadaDaAula(token, tela.aula.id)
    return (
      <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
        {!leituraDaAula.ok ? (
          <Aviso titulo="Não foi possível abrir" texto={leituraDaAula.motivo} />
        ) : leituraDaAula.chamada.ja_registrada ? (
          <Aviso
            titulo={leituraDaAula.chamada.turma_nome}
            texto="Esta chamada já foi confirmada. Peça à gestora para reabrir, se precisar corrigir."
          />
        ) : leituraDaAula.chamada.alunos.length === 0 ? (
          <Aviso
            titulo={leituraDaAula.chamada.turma_nome}
            texto="Nenhum aluno para marcar nesta aula. Quem avisou que não vem já está em Reposições."
          />
        ) : (
          <Chamada
            token={token}
            aulaId={leituraDaAula.chamada.aula_id}
            turmaNome={leituraDaAula.chamada.turma_nome}
            quando={formatarQuando(leituraDaAula.chamada.data_hora_inicio)}
            alunos={leituraDaAula.chamada.alunos}
          />
        )}
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
      <h1 className="font-titulo text-2xl">Qual aula?</h1>
      <p className="mt-2 text-tinta-suave">
        Você tem mais de uma aula neste horário. Escolha para fazer a chamada.
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {tela.aulas.map((a) => (
          <li key={a.id}>
            <Link
              href={`/p/professor/${token}?aula=${a.id}`}
              className="block min-h-[44px] rounded-cartao border border-borda bg-superficie p-5 transition-all hover:border-destaque/40 active:scale-[0.99]"
            >
              <span className="font-titulo text-lg">{a.turma_nome}</span>
              <span className="mt-1 block text-sm text-tinta-suave">
                {a.horario_inicio} às {a.horario_fim}
                {a.ja_registrada && ' · chamada já confirmada'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
