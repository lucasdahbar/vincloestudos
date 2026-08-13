import Link from 'next/link'
import { aulasDisponiveis, listarPendencias } from '@/dados/reposicoes'
import { exigirGestora } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { AcoesPendencia } from './ControlesPendencia'

const TOM: Record<string, 'ativo' | 'encerrado' | 'alerta' | 'neutro'> = {
  Pendente: 'alerta',
  Agendada: 'neutro',
  Realizada: 'ativo',
  Desistida: 'encerrado',
}

export default async function PaginaReposicoes() {
  await exigirGestora()

  const hoje = new Date().toISOString().slice(0, 10)
  const [pendencias, aulas] = await Promise.all([listarPendencias(), aulasDisponiveis(hoje)])

  const opcoes = aulas.map((a) => ({
    id: a.id,
    rotulo: `${new Date(a.data_hora_inicio).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })} — ${a.turma?.nome ?? ''}`.slice(0, 70),
  }))

  const emAberto = pendencias.filter((p) => p.status === 'Pendente' || p.status === 'Agendada')

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Reposições</h1>
        <p className="mt-1 text-tinta-suave">
          {emAberto.length} em aberto de {pendencias.length} no total
        </p>
      </header>

      {pendencias.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma reposição pendente"
          descricao="Quando um aluno falta a uma aula, a reposição aparece aqui automaticamente para você agendar."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {pendencias.map((p) => (
            <li key={p.id}>
              <Cartao>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/cadastros/alunos/${p.aluno_id}`}
                      className="font-medium text-destaque hover:underline"
                    >
                      {p.aluno?.nome}
                    </Link>
                    <p className="mt-1 text-sm text-tinta-suave">
                      Faltou em {p.aula_origem?.turma?.nome} ·{' '}
                      {p.aula_origem
                        ? new Date(p.aula_origem.data_hora_inicio).toLocaleDateString('pt-BR')
                        : '—'}
                    </p>
                  </div>
                  <Selo tom={TOM[p.status]}>{p.status}</Selo>
                </div>

                {(p.status === 'Pendente' || p.status === 'Agendada') && (
                  <div className="mt-4">
                    <AcoesPendencia pendenciaId={p.id} aulas={opcoes} />
                  </div>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
