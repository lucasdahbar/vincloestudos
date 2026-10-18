import { carregarFila } from '@/dados/cadastro-publico'
import { exigirGestora } from '@/dados/sessao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { titulo } from '@/marca'
import { CancelarConvite } from './CancelarConvite'
import { DecisaoEnvio } from './DecisaoEnvio'
import { NovoConvite } from './NovoConvite'

export const metadata = { title: titulo('Novos cadastros') }

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function data(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default async function PaginaNovosCadastros() {
  await exigirGestora()
  const { pendentes, convites } = await carregarFila()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Novos cadastros</h1>
        <p className="mt-1 text-tinta-suave">
          {pendentes.length === 0
            ? 'Nenhum cadastro esperando conferência.'
            : `${pendentes.length} esperando conferência`}
        </p>
      </header>

      <NovoConvite />

      {pendentes.length === 0 ? (
        <EstadoVazio
          titulo="Fila vazia"
          descricao="Quando um responsável preencher o link, o cadastro aparece aqui. Ele só entra no sistema depois que você aprovar."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {pendentes.map((e) => {
            const r = e.dados.responsavel
            const endereco = [
              [r.endereco, r.numero].filter(Boolean).join(', '),
              r.complemento,
              r.bairro,
              [r.cidade, r.estado].filter(Boolean).join('/'),
              r.cep,
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={e.id}>
                <Cartao className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg">{r.nome}</h2>
                      <p className="text-sm text-tinta-suave">
                        Recebido em {dataHora(e.recebido_em)}
                        {e.identificacao && ` · link enviado para ${e.identificacao}`}
                      </p>
                    </div>
                    {e.parecidos.length > 0 && <Selo tom="alerta">Parecido com cadastro existente</Selo>}
                  </div>

                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-tinta-suave">CPF</dt>
                      <dd>{r.cpf}</dd>
                    </div>
                    <div>
                      <dt className="text-tinta-suave">Telefone</dt>
                      <dd>{r.telefone}</dd>
                    </div>
                    <div>
                      <dt className="text-tinta-suave">E-mail</dt>
                      <dd className="break-all">{r.email}</dd>
                    </div>
                    <div>
                      <dt className="text-tinta-suave">Endereço</dt>
                      <dd>{endereco}</dd>
                    </div>
                  </dl>

                  <div>
                    <h3 className="mb-2 font-medium">
                      {e.dados.alunos.length === 1 ? 'Aluno' : `Alunos (${e.dados.alunos.length})`}
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm">
                      {e.dados.alunos.map((a, i) => (
                        <li key={i}>
                          <strong>{a.nome}</strong>
                          {a.data_nascimento &&
                            ` · nasceu em ${a.data_nascimento.split('-').reverse().join('/')}`}
                          {a.telefone && ` · ${a.telefone}`}
                          {a.email && ` · ${a.email}`}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <DecisaoEnvio envioId={e.id} parecidos={e.parecidos} />
                </Cartao>
              </li>
            )
          })}
        </ul>
      )}

      {convites.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl">Links enviados, ainda sem resposta</h2>
          <ul className="flex flex-col gap-2">
            {convites.map((c) => (
              <li key={c.id}>
                <Cartao className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.identificacao ?? 'Sem identificação'}</p>
                    <p className="text-sm text-tinta-suave">
                      Gerado em {data(c.criado_em)}
                      {c.situacao === 'valido' && ` · vale até ${data(c.expira_em)}`}
                    </p>
                  </div>
                  {c.situacao === 'valido' ? (
                    <CancelarConvite conviteId={c.id} />
                  ) : (
                    <Selo tom="encerrado">{c.situacao === 'expirado' ? 'Expirado' : 'Cancelado'}</Selo>
                  )}
                </Cartao>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
