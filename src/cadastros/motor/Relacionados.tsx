import Link from 'next/link'
import { clienteServidor } from '@/dados/cliente'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'

interface Painel {
  titulo: string
  vazio: string
  itens: { id: number; rotulo: string; href: string; selo?: string }[]
  acao?: { rotulo: string; href: string }
}

/** Relacoes exigidas pelo Adendo secao 7 e pelos Operacionais secao 9. */
export async function paineisDe(rota: string, id: number): Promise<Painel[]> {
  const supabase = await clienteServidor()

  if (rota === 'professores') {
    const { data } = await supabase
      .from('turmas')
      .select('id, nome, status')
      .eq('professor_id', id)
      .order('nome')

    return [
      {
        titulo: 'Turmas deste professor',
        vazio: 'Este professor ainda não é responsável por nenhuma turma.',
        acao: { rotulo: '+ Adicionar turma', href: '/turmas/nova' },
        itens: (data ?? []).map((t) => ({
          id: t.id,
          rotulo: t.nome,
          href: `/turmas/${t.id}`,
          selo: t.status,
        })),
      },
    ]
  }

  if (rota === 'alunos') {
    const { data } = await supabase
      .from('matriculas')
      .select('id, status, flag_reposicao, turma:turmas!turma_id (id, nome)')
      .eq('aluno_id', id)
      .order('data_inicio', { ascending: false })

    return [
      {
        titulo: 'Turmas e matrículas',
        vazio: 'Este aluno ainda não está matriculado em nenhuma turma.',
        acao: { rotulo: '+ Matricular em turma', href: `/matriculas/nova?aluno=${id}` },
        itens: (data ?? []).map((m) => {
          const turma = m.turma as unknown as { id: number; nome: string } | null
          return {
            id: m.id,
            rotulo: turma?.nome ?? 'Turma removida',
            href: `/turmas/${turma?.id}`,
            selo: m.flag_reposicao ? 'Reposição' : m.status,
          }
        }),
      },
    ]
  }

  if (rota === 'responsaveis') {
    const { data } = await supabase
      .from('alunos')
      .select('id, nome, ativo')
      .eq('responsavel_id', id)
      .order('nome')

    return [
      {
        titulo: 'Alunos sob responsabilidade',
        vazio: 'Nenhum aluno vinculado a este responsável ainda.',
        itens: (data ?? []).map((a) => ({
          id: a.id,
          rotulo: a.nome,
          href: `/cadastros/alunos/${a.id}`,
          selo: a.ativo ? undefined : 'Inativo',
        })),
      },
    ]
  }

  return []
}

export function PainelRelacionados({ painel }: { painel: Painel }) {
  return (
    <Cartao>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg">{painel.titulo}</h2>
        {painel.acao && (
          <BotaoLink href={painel.acao.href} aparencia="secundario" className="text-sm">
            {painel.acao.rotulo}
          </BotaoLink>
        )}
      </div>

      {painel.itens.length === 0 ? (
        <p className="text-tinta-suave">{painel.vazio}</p>
      ) : (
        <ul className="divide-y divide-borda/60">
          {painel.itens.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-3">
              <Link href={item.href} className="font-medium text-destaque hover:underline">
                {item.rotulo}
              </Link>
              {item.selo && (
                <Selo tom={item.selo === 'Ativa' || item.selo === 'Ativo' ? 'ativo' : 'encerrado'}>
                  {item.selo}
                </Selo>
              )}
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}
