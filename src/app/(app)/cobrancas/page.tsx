import Link from 'next/link'
import { alunosDasCobrancasDoMes, listarCobrancas } from '@/dados/cobrancas'
import { exigirGestora } from '@/dados/sessao'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { OPCOES_DE_STATUS, listaDeCobrancas } from '@/dominio/cobrancas/lista'
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
  const status = comoOpcao(params.status, OPCOES_DE_STATUS)

  const [doMes, alunos] = await Promise.all([listarCobrancas({ mes }), alunosDasCobrancasDoMes(mes)])
  const total = doMes.reduce((s, c) => s + c.valor_total, 0)
  const recebido = doMes.reduce((s, c) => s + c.recebido, 0)
  const cobrancas = listaDeCobrancas(
    doMes.map((c) => ({ ...c, alunos: alunos.get(c.id) ?? [] })),
    busca,
    status,
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Cobranças</h1>
        <p className="mt-1 text-tinta-suave">
          {mes.split('-').reverse().join('/')}: {doMes.length} cobrança(s) · {formatarBRL(total)} no
          total · {formatarBRL(recebido)} recebido
        </p>
      </header>

      <PainelGeracao mes={mes} />

      {doMes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma cobrança neste mês"
          descricao="Escolha o mês acima e gere as cobranças. O sistema junta as aulas previstas de cada responsável, agrupando todos os filhos."
        />
      ) : (
        <>
          <Filtros
            busca={{ campo: 'busca', rotulo: 'Responsável ou aluno', placeholder: 'Digite um nome' }}
            seletores={[{ campo: 'status', rotulo: 'Status', opcoes: deValores(OPCOES_DE_STATUS) }]}
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
                        <Selo tom={TOM[c.status]}>{c.status}</Selo>
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
