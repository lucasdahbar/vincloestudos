import Link from 'next/link'
import { baseDoRelatorioFinanceiro } from '@/dados/relatorio-financeiro'
import { exigirGestora } from '@/dados/sessao'
import { rotuloDoStatus } from '@/dominio/cobrancas/lista'
import { INICIO_DA_COBRANCA_NO_SISTEMA } from '@/dominio/cobrancas/inicio'
import { formatarBRL } from '@/dominio/dinheiro'
import { comoId, comoOpcao, comoTexto, deValores } from '@/dominio/filtros'
import {
  DIMENSOES,
  SITUACOES,
  agrupar,
  calcularTotais,
  filtrarLinhas,
  type LinhaFinanceira,
  type Situacao,
} from '@/dominio/relatorios/financeiro'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Filtros } from '@/ui/Filtros'
import { Selo, tomDoStatus } from '@/ui/Selo'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const mesPorExtenso = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`

/** "Sem cobrança" e "Não cobrada" nao sao status do banco: ficam como estao. */
const rotulo = (s: Situacao) => rotuloDoStatus(s)

/** Do mes em que a cobranca entrou no sistema ate o mes que vem. */
function mesesDisponiveis(atual: string): string[] {
  const meses: string[] = []
  let [ano, mes] = INICIO_DA_COBRANCA_NO_SISTEMA.slice(0, 7).split('-').map(Number)
  const [anoFim, mesFim] = atual.split('-').map(Number)
  const limite = anoFim * 12 + mesFim
  while (ano * 12 + mes <= limite) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`)
    mes++
    if (mes > 12) {
      mes = 1
      ano++
    }
  }
  return meses.reverse()
}

/** Opcoes de um filtro: so o que aparece nas aulas do mes. */
function opcoesDe(linhas: LinhaFinanceira[], valor: (l: LinhaFinanceira) => string | number | null, nome: (l: LinhaFinanceira) => string) {
  const vistas = new Map<string, string>()
  for (const l of linhas) {
    const v = valor(l)
    if (v !== null && v !== '' && !vistas.has(String(v))) vistas.set(String(v), nome(l))
  }
  return [...vistas]
    .map(([v, n]) => ({ valor: v, nome: n }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export default async function PaginaRelatorioFinanceiro({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirGestora()
  const params = await searchParams

  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  const [anoHoje, mesHoje] = hoje.split('-').map(Number)
  const proximo = mesHoje === 12 ? `${anoHoje + 1}-01` : `${anoHoje}-${String(mesHoje + 1).padStart(2, '0')}`
  const meses = mesesDisponiveis(proximo)
  const mes = comoOpcao(params.mes, meses) ?? hoje

  const { linhas: todas, cobrancas } = await baseDoRelatorioFinanceiro(mes)

  const contas = [...new Set([...cobrancas.values()].flatMap((c) => c.recebimentos.map((r) => r.conta ?? 'Crédito')))].sort()
  const conta = comoOpcao(params.conta, contas)
  const dimensao = comoOpcao(
    params.agrupar,
    DIMENSOES.map((d) => d.valor),
  )

  const linhas = filtrarLinhas(todas, {
    responsavel_id: comoId(params.responsavel),
    aluno_id: comoId(params.aluno),
    professor_id: comoId(params.professor),
    materia: comoTexto(params.materia),
    ano_escolar: comoTexto(params.ano),
    escola: comoTexto(params.escola),
    turma: comoTexto(params.turma),
    servico: comoTexto(params.servico),
    situacao: comoOpcao(params.status, SITUACOES),
  })
  const totais = calcularTotais(linhas, cobrancas, conta)
  const grupos = dimensao ? agrupar(linhas, dimensao, cobrancas, conta) : null

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Relatório financeiro</h1>
        <p className="mt-1 text-tinta-suave">
          Aulas de {mesPorExtenso(mes)} lançadas na agenda, cobradas ou não, com o status da
          cobrança de cada uma.
        </p>
      </header>

      <Filtros
        seletores={[
          {
            campo: 'mes',
            rotulo: 'Mês',
            opcoes: meses.map((m) => ({ valor: m, nome: mesPorExtenso(m) })),
            todos: 'Mês atual',
          },
          { campo: 'status', rotulo: 'Status da cobrança', opcoes: SITUACOES.map((s) => ({ valor: s, nome: rotulo(s) })), todos: 'Todos' },
          { campo: 'responsavel', rotulo: 'Responsável', opcoes: opcoesDe(todas, (l) => l.responsavel_id, (l) => l.responsavel) },
          { campo: 'aluno', rotulo: 'Aluno', opcoes: opcoesDe(todas, (l) => l.aluno_id, (l) => l.aluno) },
          { campo: 'professor', rotulo: 'Professor', opcoes: opcoesDe(todas, (l) => l.professor_id, (l) => l.professor) },
          { campo: 'escola', rotulo: 'Escola', opcoes: opcoesDe(todas, (l) => l.escola, (l) => l.escola), todos: 'Todas' },
          { campo: 'materia', rotulo: 'Matéria', opcoes: opcoesDe(todas, (l) => l.materia, (l) => l.materia), todos: 'Todas' },
          { campo: 'ano', rotulo: 'Ano escolar', opcoes: opcoesDe(todas, (l) => l.ano_escolar, (l) => l.ano_escolar) },
          { campo: 'turma', rotulo: 'Turma', opcoes: opcoesDe(todas, (l) => l.turma, (l) => l.turma), todos: 'Todas' },
          { campo: 'servico', rotulo: 'Serviço', opcoes: opcoesDe(todas, (l) => l.servico, (l) => l.servico) },
          { campo: 'conta', rotulo: 'Conta (recebido)', opcoes: deValores(contas), todos: 'Todas' },
          {
            campo: 'agrupar',
            rotulo: 'Agrupar por',
            opcoes: DIMENSOES.map((d) => ({ valor: d.valor, nome: d.rotulo })),
            todos: 'Não agrupar',
          },
        ]}
        total={linhas.length}
        contagem={{
          um: 'aula com esses filtros',
          varios: 'aulas com esses filtros',
          nenhum: 'Nenhuma aula com esses filtros.',
        }}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero titulo="Vendido" valor={totais.vendido} nota="Aulas do mês, cobradas ou não" />
        <Numero
          titulo={conta ? `Recebido em ${conta}` : 'Recebido'}
          valor={totais.recebido}
          nota="Rateado pela parte da cobrança"
        />
        <Numero titulo="A receber" valor={totais.aReceber} nota="Já enviado e ainda não pago" />
        <Numero titulo="Não cobrado" valor={totais.naoCobrado} nota="Aulas que vocês decidiram não cobrar" />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Cartao>
          <h2 className="mb-3 text-lg">Por status da cobrança</h2>
          <ul className="flex flex-col gap-1.5">
            {SITUACOES.filter((s) => totais.porSituacao[s] > 0).map((s) => (
              <li key={s} className="flex items-center justify-between gap-3">
                <Link href={`?${novaUrl(params, { status: s })}`} className="hover:underline">
                  <Selo tom={tomDoStatus(s)}>{rotulo(s)}</Selo>
                </Link>
                <span className="tabular-nums">{formatarBRL(totais.porSituacao[s])}</span>
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao>
          <h2 className="mb-3 text-lg">Recebido por conta</h2>
          {totais.porConta.length === 0 ? (
            <p className="text-sm text-tinta-suave">Nada recebido com esses filtros.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {totais.porConta.map((c) => (
                <li key={c.conta} className="flex items-center justify-between gap-3">
                  <span>{c.conta}</span>
                  <span className="tabular-nums">{formatarBRL(c.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma aula" descricao="Troque o mês ou limpe os filtros." />
      ) : grupos ? (
        <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie shadow-cartao">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-superficie-2 text-left text-tinta-suave">
              <tr>
                <th className="px-4 py-2 font-medium">{DIMENSOES.find((d) => d.valor === dimensao)?.rotulo}</th>
                <th className="px-4 py-2 text-right font-medium">Aulas</th>
                <th className="px-4 py-2 text-right font-medium">Vendido</th>
                <th className="px-4 py-2 text-right font-medium">Recebido</th>
                <th className="px-4 py-2 text-right font-medium">A receber</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.rotulo} className="border-t border-borda/60">
                  <td className="px-4 py-2">{dimensao === 'situacao' ? rotulo(g.rotulo as Situacao) : g.rotulo}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{g.aulas}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatarBRL(g.totais.vendido)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatarBRL(g.totais.recebido)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatarBRL(g.totais.aReceber)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie shadow-cartao">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-superficie-2 text-left text-tinta-suave">
              <tr>
                <th className="px-3 py-2 font-medium">Aula</th>
                <th className="px-3 py-2 font-medium">Aluno · responsável</th>
                <th className="px-3 py-2 font-medium">Turma</th>
                <th className="px-3 py-2 font-medium">Professor</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.chave} className="border-t border-borda/60 align-top">
                  <td className="whitespace-nowrap px-3 py-2">
                    {l.data.slice(8, 10)}/{l.data.slice(5, 7)}
                    <span className="block text-xs text-tinta-suave">
                      {l.inicio}–{l.fim}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {l.aluno}
                    <span className="block text-xs text-tinta-suave">{l.responsavel}</span>
                  </td>
                  <td className="px-3 py-2">
                    {[l.materia, l.ano_escolar].filter(Boolean).join(' · ')}
                    <span className="block text-xs text-tinta-suave">
                      {[l.escola, l.servico].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className="px-3 py-2">{l.professor}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatarBRL(l.valor)}</td>
                  <td className="px-3 py-2">
                    {l.cobranca_id ? (
                      <Link href={`/cobrancas/${l.cobranca_id}`} className="hover:underline">
                        <Selo tom={tomDoStatus(l.situacao)}>{rotulo(l.situacao)}</Selo>
                      </Link>
                    ) : (
                      <Selo tom={tomDoStatus(l.situacao)}>{rotulo(l.situacao)}</Selo>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Numero({ titulo, valor, nota }: { titulo: string; valor: number; nota: string }) {
  return (
    <Cartao>
      <p className="text-sm text-tinta-suave">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{formatarBRL(valor)}</p>
      <p className="mt-1 text-xs text-tinta-tenue">{nota}</p>
    </Cartao>
  )
}

/** A URL atual com alguns parametros trocados. */
function novaUrl(params: Record<string, string | string[] | undefined>, trocas: Record<string, string>) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string') u.set(k, v)
  for (const [k, v] of Object.entries(trocas)) u.set(k, v)
  return u.toString()
}
