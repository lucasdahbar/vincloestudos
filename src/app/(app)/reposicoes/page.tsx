import Link from 'next/link'
import { aulasDisponiveis, listarPendencias, type PendenciaComRelacoes } from '@/dados/reposicoes'
import { exigirGestora } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { AcoesPendencia } from './ControlesPendencia'
import { CancelarAviso } from './CancelarAviso'

/** O que a gestora decidiu sobre a aula perdida, para quem olha depois. */
function decisaoDaDesistencia(cobrar: boolean | null, pagarProfessor: boolean | null): string {
  if (cobrar === false) return 'Aula não cobrada'
  if (pagarProfessor) return 'Aula cobrada · desistência paga ao professor'
  return 'Aula cobrada · professor não recebe'
}

const TOM: Record<string, 'ativo' | 'encerrado' | 'alerta' | 'neutro'> = {
  Pendente: 'alerta',
  Agendada: 'neutro',
  Realizada: 'ativo',
  Desistida: 'encerrado',
}

/**
 * As horas são gravadas como horário da escola, sem fuso (16h é 16h): ler em
 * UTC mostra o que foi gravado, onde quer que o servidor rode.
 */
function quando(iso: string, comHora: boolean): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/**
 * Pedido do Julio (20/10/2026): a tela principal só tem o que espera uma
 * decisão da gestora. Reposição marcada, realizada ou desistida vai para o
 * histórico. Quem avisa ou falta à reposição marcada volta para as pendentes
 * (a regra está em dados/reposicoes.ts e dados/gravar-chamada.ts).
 */
const ABAS = [
  { chave: 'pendentes', rotulo: 'Pendentes' },
  { chave: 'historico', rotulo: 'Histórico' },
] as const

export default async function PaginaReposicoes({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>
}) {
  await exigirGestora()
  const { aba } = await searchParams
  const noHistorico = aba === 'historico'

  const hoje = new Date().toISOString().slice(0, 10)
  const [todas, aulas] = await Promise.all([listarPendencias(), aulasDisponiveis(hoje)])

  const opcoes = aulas.map((a) => ({
    id: a.id,
    rotulo: `${quando(a.data_hora_inicio, true)} — ${a.turma?.nome ?? ''}`.slice(0, 70),
  }))

  const pendentes = todas.filter((p) => p.status === 'Pendente')
  // As marcadas primeiro: são as que ainda podem pedir uma ação (remarcar).
  const historico = todas
    .filter((p) => p.status !== 'Pendente')
    .sort((a, b) => Number(b.status === 'Agendada') - Number(a.status === 'Agendada'))
  const lista = noHistorico ? historico : pendentes
  const contagem = { pendentes: pendentes.length, historico: historico.length }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Reposições</h1>
        <p className="mt-1 text-tinta-suave">
          {pendentes.length === 0
            ? 'Nenhuma reposição pendente'
            : `${pendentes.length} ${pendentes.length === 1 ? 'pendente' : 'pendentes'}, esperando você marcar ou registrar a desistência`}
        </p>
      </header>

      <nav aria-label="Reposições" className="flex gap-2 border-b border-borda">
        {ABAS.map((a) => {
          const ativa = (a.chave === 'historico') === noHistorico
          return (
            <Link
              key={a.chave}
              href={a.chave === 'historico' ? '/reposicoes?aba=historico' : '/reposicoes'}
              aria-current={ativa ? 'page' : undefined}
              className={`-mb-px min-h-[44px] border-b-2 px-4 py-2.5 font-medium ${
                ativa
                  ? 'border-destaque text-destaque'
                  : 'border-transparent text-tinta-suave hover:text-tinta'
              }`}
            >
              {a.rotulo} ({contagem[a.chave]})
            </Link>
          )
        })}
      </nav>

      {lista.length === 0 ? (
        noHistorico ? (
          <EstadoVazio
            titulo="O histórico está vazio"
            descricao="As reposições marcadas, realizadas ou desistidas aparecem aqui."
          />
        ) : (
          <EstadoVazio
            titulo="Nenhuma reposição pendente"
            descricao="Quando um aluno falta ou avisa que não vem, ele aparece aqui para você marcar a reposição ou registrar a desistência."
          />
        )
      ) : (
        <ul className="flex flex-col gap-4">
          {lista.map((p) => (
            <li key={p.id}>
              <CartaoDaReposicao p={p} opcoes={opcoes} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CartaoDaReposicao({
  p,
  opcoes,
}: {
  p: PendenciaComRelacoes
  opcoes: { id: number; rotulo: string }[]
}) {
  const destino = p.aula_reposicao
  const destinoTexto = destino
    ? `${quando(destino.data_hora_inicio, true)} · ${destino.turma?.nome ?? ''}`
    : null

  return (
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
            {{ Aviso: 'Avisou que não vinha a', Falta: 'Faltou em', Exclusão: 'Aula excluída de' }[p.origem]}{' '}
            {p.aula_origem?.turma?.nome} ·{' '}
            {p.aula_origem ? quando(p.aula_origem.data_hora_inicio, false) : '—'}
          </p>
        </div>
        <Selo tom={TOM[p.status]}>{p.status}</Selo>
      </div>

      {/* Pendente que ainda guarda a aula: o aluno faltou à reposição marcada. */}
      {p.status === 'Pendente' && destinoTexto && (
        <p className="mt-2 rounded-campo bg-alerta-suave px-3 py-2 text-sm text-alerta">
          Faltou à reposição marcada para {destinoTexto}. Marque outra ou registre a desistência.
        </p>
      )}

      {(p.status === 'Agendada' || p.status === 'Realizada') && destinoTexto && (
        <p className="mt-2 text-sm text-tinta-suave">
          {p.status === 'Agendada' ? 'Marcada para' : 'Feita em'} {destinoTexto}
        </p>
      )}

      {p.status === 'Desistida' && (
        <p className="mt-2 text-sm text-tinta-suave">
          {decisaoDaDesistencia(p.cobrar, p.pagar_professor)}
        </p>
      )}

      {p.origem === 'Aviso' && (p.status === 'Pendente' || p.status === 'Desistida') && (
        <div className="mt-2">
          <CancelarAviso pendenciaId={p.id} nome={p.aluno?.nome ?? 'O aluno'} />
        </div>
      )}

      {(p.status === 'Pendente' || p.status === 'Agendada') && (
        <div className="mt-4">
          <AcoesPendencia pendenciaId={p.id} aulas={opcoes} remarcar={p.status === 'Agendada'} />
        </div>
      )}
    </Cartao>
  )
}
