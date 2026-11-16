import Link from 'next/link'
import { alunosDasCobrancasDoMes, chamadasSemMatriculaDoMes, listarCobrancas } from '@/dados/cobrancas'
import { exigirGestora } from '@/dados/sessao'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import {
  OPCOES_DE_COBRANCAS,
  listaDeCobrancas,
  rotuloDoStatus,
  statusDaTelaDeCobrancas,
} from '@/dominio/cobrancas/lista'
import { formatarBRL } from '@/dominio/dinheiro'
import { comoOpcao, comoTexto, deValores } from '@/dominio/filtros'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Filtros } from '@/ui/Filtros'
import { Selo } from '@/ui/Selo'
import { PainelGeracao } from './PainelGeracao'

const TOM: Record<string, 'ativo' | 'encerrado' | 'alerta' | 'neutro'> = {
  Rascunho: 'encerrado',
  Confirmada: 'neutro',
  Enviada: 'neutro',
  Parcial: 'alerta',
  Quitada: 'ativo',
  Cancelada: 'encerrado',
}

export default async function PaginaCobrancas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirGestora()
  const params = await searchParams
  // A tela mostra um mês por vez (pedido do Julio, 03/11/2026); sem mês na
  // URL, é o mês corrente no relógio da escola.
  const mesDaUrl = comoTexto(params.mes)
  const mes = mesDaUrl && /^\d{4}-\d{2}$/.test(mesDaUrl) ? mesDaUrl : agoraNaEscola(new Date()).slice(0, 7)
  const busca = comoTexto(params.busca)
  const status = comoOpcao(params.status, OPCOES_DE_COBRANCAS)

  const [doMes, alunos, semMatricula] = await Promise.all([
    listarCobrancas({ mes }),
    alunosDasCobrancasDoMes(mes),
    chamadasSemMatriculaDoMes(mes),
  ])
  // Separacao das telas (09/11/2026): daqui so o que ainda nao foi mandado.
  const rascunhos = doMes.filter((c) => c.status === 'Rascunho')
  const confirmadas = doMes.filter((c) => c.status === 'Confirmada')
  const enviadas = doMes.filter((c) => !['Rascunho', 'Confirmada', 'Cancelada'].includes(c.status))
  const cobrancas = listaDeCobrancas(
    doMes.map((c) => ({ ...c, alunos: alunos.get(c.id) ?? [] })),
    busca,
    statusDaTelaDeCobrancas(status),
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Cobranças</h1>
        <p className="mt-1 text-tinta-suave">
          {mes.split('-').reverse().join('/')}: {rascunhos.length} rascunho(s) ·{' '}
          {confirmadas.length} pronta(s) para enviar ·{' '}
          {formatarBRL([...rascunhos, ...confirmadas].reduce((s, c) => s + c.valor_total, 0))}
        </p>
        {enviadas.length > 0 && (
          <p className="mt-1 text-sm text-tinta-suave">
            As {enviadas.length} já enviadas deste mês estão em{' '}
            <Link href="/recebimentos" className="font-medium text-destaque hover:underline">
              Recebimentos
            </Link>
            .
          </p>
        )}
      </header>

      <PainelGeracao mes={mes} />

      {/* Caso Alice (16/11/2026): chamada sem matrícula é aula que nunca entra na cobrança. */}
      {semMatricula.length > 0 && (
        <section className="rounded-cartao border border-alerta/40 bg-alerta-suave p-5">
          <h2 className="font-medium text-alerta">
            {semMatricula.length === 1
              ? '1 aula com chamada fica fora da cobrança'
              : `${semMatricula.length} aulas com chamada ficam fora da cobrança`}
          </h2>
          <p className="mt-1 text-sm">
            O aluno está na chamada, mas não tem matrícula na turma nessa data. Crie a matrícula e gere as
            cobranças de novo.
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {semMatricula.map((c) => (
              <li key={`${c.aula_id}-${c.aluno}`}>
                <Link href={`/agenda/aulas/${c.aula_id}`} className="font-medium hover:underline">
                  {c.dia.split('-').reverse().join('/')}
                </Link>{' '}
                · {c.aluno} · <span className="text-tinta-suave">{c.turma}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {doMes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma cobrança neste mês"
          descricao="Escolha o mês acima e gere as cobranças. O sistema junta as aulas previstas de cada responsável, agrupando todos os filhos."
        />
      ) : (
        <>
          <Filtros
            busca={{ campo: 'busca', rotulo: 'Responsável ou aluno', placeholder: 'Digite um nome' }}
            seletores={[
              {
                campo: 'status',
                rotulo: 'Status',
                opcoes: deValores(OPCOES_DE_COBRANCAS),
                todos: 'Rascunho e pronta p/ enviar',
              },
            ]}
            total={cobrancas.length}
            contagem={{
              um: 'cobrança encontrada',
              varios: 'cobranças encontradas',
              nenhum: 'Nenhuma cobrança deste mês com esses filtros.',
            }}
          />

          <ul className="flex flex-col gap-3">
            {cobrancas.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cobrancas/${c.id}`}
                  className="block rounded-cartao border border-borda bg-superficie p-5 transition-all hover:-translate-y-0.5 hover:border-destaque/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{c.responsavel?.nome}</p>
                      {c.alunos.length > 0 && (
                        <p className="mt-1 text-sm text-tinta-suave">{c.alunos.join(', ')}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-titulo text-xl">{formatarBRL(c.valor_total)}</p>
                      {c.recebido > 0 && c.recebido < c.valor_total && (
                        <p className="text-sm text-alerta">
                          falta {formatarBRL(c.valor_total - c.recebido)}
                        </p>
                      )}
                      <div className="mt-1">
                        <Selo tom={TOM[c.status]}>{rotuloDoStatus(c.status)}</Selo>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
