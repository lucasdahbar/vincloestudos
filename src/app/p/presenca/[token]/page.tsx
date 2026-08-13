import { aulaPorToken } from '@/dados/presencas'
import { Chamada } from './Chamada'

export const metadata = { title: 'Registro de presença — Mesinha Redonda' }

function formatarQuando(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function PaginaPresenca({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const leitura = await aulaPorToken(token)

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 py-10">
      {!leitura.ok ? (
        <div className="rounded-cartao border border-borda bg-superficie p-8 text-center">
          <h1 className="font-titulo text-2xl">Link indisponível</h1>
          <p className="mt-3 text-tinta-suave">{leitura.motivo}</p>
        </div>
      ) : leitura.aula.alunos.length === 0 ? (
        <div className="rounded-cartao border border-borda bg-superficie p-8 text-center">
          <h1 className="font-titulo text-2xl">{leitura.aula.turma_nome}</h1>
          <p className="mt-3 text-tinta-suave">
            Nenhum aluno matriculado nesta turma na data da aula. Fale com a gestora.
          </p>
        </div>
      ) : (
        <Chamada
          token={token}
          turmaNome={leitura.aula.turma_nome}
          quando={formatarQuando(leitura.aula.data_hora_inicio)}
          alunos={leitura.aula.alunos}
        />
      )}
    </main>
  )
}
