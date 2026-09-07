import Link from 'next/link'
import { autorizacaoAtual, credenciaisDoApp } from '@/agenda/credenciais'
import { exigirGestora } from '@/dados/sessao'
import { clienteServidor } from '@/dados/cliente'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'
import { Desconectar } from './Desconectar'
import { titulo } from '@/marca'

export const metadata = { title: titulo('Integrações') }
export const dynamic = 'force-dynamic'

const MOTIVOS: Record<string, string> = {
  'sem-credenciais':
    'O sistema ainda não tem as credenciais do Google. Fale com quem cuida da parte técnica.',
  recusado: 'A autorização foi recusada na tela do Google.',
  estado: 'A autorização não pôde ser confirmada. Tente de novo a partir desta tela.',
  'sem-codigo': 'O Google voltou sem a autorização. Tente de novo.',
  troca: 'O Google recusou a autorização.',
}

export default async function PaginaIntegracoes({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; erro?: string; motivo?: string }>
}) {
  await exigirGestora()
  const { conectado, erro, motivo } = await searchParams

  const [autorizacao, supabase] = await Promise.all([autorizacaoAtual(), clienteServidor()])
  const temCredenciais = credenciaisDoApp() !== null
  const ligado = process.env.GOOGLE_CALENDAR_ATIVO === 'true'

  // G1: sem a agenda no cadastro, a turma daquele professor não gera evento.
  const { data: professores } = await supabase
    .from('professores')
    .select('id, nome, google_calendar_id')
    .eq('ativo', true)
    .order('nome')

  const semAgenda = (professores ?? []).filter((p) => !p.google_calendar_id)

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-3xl">Integrações</h1>
        <p className="mt-1 text-tinta-suave">
          Conexões do sistema com serviços de fora.
        </p>
      </header>

      {conectado && (
        <p className="rounded-campo bg-apoio-suave px-4 py-3 text-apoio">
          Google Agenda conectado.
        </p>
      )}

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {motivo ?? MOTIVOS[erro] ?? 'Não foi possível conectar.'}
        </p>
      )}

      <Cartao className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg">Google Agenda</h2>
            <p className="mt-1 text-sm text-tinta-suave">
              Deixa o sistema criar o evento de cada turma direto na agenda do professor, em
              vez de você criar à mão.
            </p>
          </div>
          <Selo tom={autorizacao ? 'ativo' : 'neutro'}>
            {autorizacao ? 'Conectado' : 'Não conectado'}
          </Selo>
        </div>

        {!temCredenciais ? (
          <p className="rounded-campo bg-superficie-2 px-4 py-3 text-sm text-tinta-suave">
            Falta a parte técnica: as credenciais do Google ainda não foram configuradas no
            sistema. Quem cuida disso tem o roteiro em <code>docs/google-agenda.md</code>.
          </p>
        ) : autorizacao ? (
          <>
            <p className="text-sm text-tinta-suave">
              Autorizado{autorizacao.email ? ` pela conta ${autorizacao.email}` : ''} em{' '}
              {new Date(autorizacao.conectado_em).toLocaleDateString('pt-BR')}.
            </p>

            {!ligado && (
              <p className="rounded-campo bg-alerta-suave px-4 py-3 text-sm text-alerta">
                A conexão está feita, mas a criação automática de eventos ainda está desligada.
                Falta trocar <code>GOOGLE_CALENDAR_ATIVO</code> para <code>true</code> — peça a
                quem cuida da parte técnica.
              </p>
            )}

            <Desconectar />
          </>
        ) : (
          <div>
            <BotaoLink href="/api/google/autorizar">Conectar o Google Agenda</BotaoLink>
            <p className="mt-2 text-sm text-tinta-suave">
              Você vai para o Google escolher a conta da empresa e clicar em Permitir. É uma vez
              só.
            </p>
          </div>
        )}
      </Cartao>

      {/* G1: a conexão sozinha não basta — cada professor precisa da agenda dele. */}
      {autorizacao && semAgenda.length > 0 && (
        <Cartao className="border-alerta/30 bg-alerta-suave">
          <h2 className="text-lg text-alerta">Professores sem agenda vinculada</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            As turmas destes professores não geram evento, porque o sistema não sabe em qual
            agenda criar. No Google Agenda: Configurações da agenda → Integrar agenda → ID da
            agenda.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {semAgenda.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/cadastros/professores/${p.id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  {p.nome}
                </Link>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  )
}
