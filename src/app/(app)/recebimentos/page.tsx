import Link from 'next/link'
import { alunosDasCobrancasDoMes, listarCobrancas } from '@/dados/cobrancas'
import { clienteServidor } from '@/dados/cliente'
import { obterRecebimento } from '@/dados/recebimentos'
import { exigirGestora } from '@/dados/sessao'
import {
  OPCOES_DE_RECEBIMENTOS,
  listaDeCobrancas,
  rotuloDoStatus,
  statusDaTelaDeRecebimentos,
} from '@/dominio/cobrancas/lista'
import { formatarBRL } from '@/dominio/dinheiro'
import { comoOpcao, comoTexto, deValores } from '@/dominio/filtros'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Filtros } from '@/ui/Filtros'
import { Selo } from '@/ui/Selo'
import { FormularioBaixa } from './FormularioBaixa'

const TOM: Record<string, 'ativo' | 'alerta' | 'neutro'> = {
  Enviada: 'neutro',
  Parcial: 'alerta',
  Quitada: 'ativo',
}

const mesNaTela = (mes: string) => mes.slice(0, 7).split('-').reverse().join('/')

export default async function PaginaRecebimentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirGestora()
  const params = await searchParams
  const cobranca = comoTexto(params.cobranca)
  const registrado = comoTexto(params.registrado)
  const busca = comoTexto(params.busca)
  const status = comoOpcao(params.status, OPCOES_DE_RECEBIMENTOS)
  const mesDaUrl = comoTexto(params.mes)
  const mes = mesDaUrl && /^\d{4}-\d{2}$/.test(mesDaUrl) ? mesDaUrl : undefined

  const supabase = await clienteServidor()
  const [todas, alunos, { data: contas }, confirmado] = await Promise.all([
    listarCobrancas(),
    alunosDasCobrancasDoMes(mes),
    supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
    registrado && /^\d+$/.test(registrado) ? obterRecebimento(Number(registrado)) : null,
  ])

  // Separacao das telas (09/11/2026): daqui, so do envio em diante.
  const daTela = todas.filter((c) => ['Enviada', 'Parcial', 'Quitada'].includes(c.status))
  const aReceber = daTela.filter((c) => c.valor_total - c.recebido > 0)
  const meses = [...new Set(daTela.map((c) => c.mes_referencia.slice(0, 7)))].sort().reverse()

  const lista = listaDeCobrancas(
    daTela
      .filter((c) => !mes || c.mes_referencia.startsWith(mes))
      .map((c) => ({ ...c, alunos: alunos.get(c.id) ?? [] })),
    busca,
    statusDaTelaDeRecebimentos(status),
  )

  // A baixa aceita tambem a Confirmada, que chega pelo botao da cobranca: a
  // familia pode pagar antes de a gestora marcar o envio, e a baixa ja conta
  // como envio (vira Parcial ou Quitada).
  const selecionada = cobranca
    ? todas.find(
        (c) =>
          c.id === Number(cobranca) &&
          !['Rascunho', 'Cancelada'].includes(c.status) &&
          c.valor_total - c.recebido > 0,
      )
    : undefined

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Recebimentos</h1>
        <p className="mt-1 text-tinta-suave">
          {aReceber.length} cobrança(s) a receber ·{' '}
          {formatarBRL(aReceber.reduce((s, c) => s + (c.valor_total - c.recebido), 0))} no total
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          A cobrança entra aqui quando você marca &ldquo;Já enviei pelo WhatsApp&rdquo; ou registra um
          pagamento. As confirmadas ainda não enviadas ficam em{' '}
          <Link href="/cobrancas" className="font-medium text-destaque hover:underline">
            Cobranças
          </Link>
          .
        </p>
      </header>

      {confirmado && (
        <div
          role="status"
          className="flex flex-col gap-4 rounded-cartao border border-apoio-borda bg-apoio-suave p-6"
        >
          <div>
            <h2 className="text-lg text-apoio">Recebimento registrado</h2>
            <p className="mt-1">
              <strong>{formatarBRL(confirmado.valor)}</strong> de {confirmado.responsavel}, em{' '}
              {confirmado.data.split('-').reverse().join('/')}
              {confirmado.forma ? ` · ${confirmado.forma}` : ''}
              {confirmado.conta ? ` · ${confirmado.conta}` : ''}
            </p>
            <p className="mt-1 text-sm text-tinta-suave">
              Cobrança de {mesNaTela(confirmado.mes)}:{' '}
              {confirmado.saldo > 0
                ? `ainda faltam ${formatarBRL(confirmado.saldo)} (${rotuloDoStatus(confirmado.status)}).`
                : 'quitada.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <BotaoLink href={`/cobrancas/${confirmado.cobrancaId}`}>Ver a cobrança</BotaoLink>
            <BotaoLink href="/recebimentos" aparencia="secundario">
              Dar baixa em outra
            </BotaoLink>
          </div>
        </div>
      )}

      {selecionada && (
        <Cartao>
          <h2 className="mb-3 text-lg">Registrar recebimento</h2>
          <FormularioBaixa
            cobrancaId={selecionada.id}
            responsavel={selecionada.responsavel?.nome ?? ''}
            saldo={selecionada.valor_total - selecionada.recebido}
            contas={contas ?? []}
          />
        </Cartao>
      )}

      {daTela.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma cobrança enviada"
          descricao="Quando você marcar uma cobrança como enviada, ela aparece aqui para dar baixa."
        />
      ) : (
        <>
          <Filtros
            busca={{ campo: 'busca', rotulo: 'Responsável ou aluno', placeholder: 'Digite um nome' }}
            seletores={[
              {
                campo: 'status',
                rotulo: 'Status',
                opcoes: deValores(OPCOES_DE_RECEBIMENTOS),
                todos: 'A receber',
              },
              {
                campo: 'mes',
                rotulo: 'Mês',
                opcoes: meses.map((m) => ({ valor: m, nome: mesNaTela(m) })),
                todos: 'Todos os meses',
              },
            ]}
            total={lista.length}
            contagem={{
              um: 'cobrança encontrada',
              varios: 'cobranças encontradas',
              nenhum: 'Nenhuma cobrança com esses filtros.',
            }}
          />

          {lista.length === 0 && !busca && !status && !mes ? (
            <EstadoVazio
              titulo="Nada a receber"
              descricao="Todas as cobranças enviadas já foram quitadas. Para vê-las, escolha Quitada no filtro."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {lista.map((c) => {
                const saldo = c.valor_total - c.recebido
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie p-5"
                  >
                    <div>
                      <Link
                        href={`/cobrancas/${c.id}`}
                        className="font-medium text-destaque hover:underline"
                      >
                        {c.responsavel?.nome}
                      </Link>
                      {c.alunos.length > 0 && (
                        <p className="mt-1 text-sm text-tinta-suave">{c.alunos.join(', ')}</p>
                      )}
                      <p className="mt-1 text-sm text-tinta-suave">
                        {mesNaTela(c.mes_referencia)} · {formatarBRL(c.valor_total)} · recebido{' '}
                        {formatarBRL(c.recebido)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {saldo > 0 && (
                        <span className="font-titulo text-lg text-alerta">{formatarBRL(saldo)}</span>
                      )}
                      <Selo tom={TOM[c.status] ?? 'neutro'}>{rotuloDoStatus(c.status)}</Selo>
                      {saldo > 0 && (
                        <Link
                          href={`/recebimentos?cobranca=${c.id}`}
                          className="font-medium text-destaque hover:underline"
                        >
                          Dar baixa
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
