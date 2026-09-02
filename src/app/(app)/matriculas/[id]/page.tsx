import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterMatricula } from '@/dados/matriculas'
import { exigirGestora } from '@/dados/sessao'
import { FormularioMatricula } from '../FormularioMatricula'
import { EncerrarMatricula } from './EncerrarMatricula'
import { Selo } from '@/ui/Selo'

/**
 * T3 (Rodada 2): a tela da matricula.
 *
 * Clicar num aluno a partir da turma abre esta pagina, e nao o cadastro geral
 * do aluno. A gestora chega aqui querendo ver as datas daquela matricula ou
 * desmatricular — no cadastro do aluno nao ha nada disso, e ela perdia o
 * contexto da turma no caminho.
 */
export default async function PaginaMatricula({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigirGestora()

  const { id } = await params
  const matricula = await obterMatricula(Number(id))
  if (!matricula) notFound()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href={`/turmas/${matricula.turma_id}`}
          className="text-sm text-destaque hover:underline"
        >
          ← {matricula.turma_nome}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{matricula.aluno_nome}</h1>
          <Selo tom={matricula.status === 'Ativa' ? 'ativo' : 'encerrado'}>
            {matricula.status}
          </Selo>
          {matricula.flag_reposicao && <Selo tom="alerta">Reposição</Selo>}
        </div>
        <p className="text-tinta-suave">
          Matrícula nesta turma. Para ver os dados pessoais,{' '}
          <Link
            href={`/cadastros/alunos/${matricula.aluno_id}`}
            className="text-destaque hover:underline"
          >
            abra o cadastro do aluno
          </Link>
          .
        </p>
      </header>

      <FormularioMatricula
        alunos={[{ id: matricula.aluno_id, nome: matricula.aluno_nome }]}
        turmas={[{ id: matricula.turma_id, nome: matricula.turma_nome }]}
        matricula={{
          id: matricula.id,
          aluno_id: matricula.aluno_id,
          turma_id: matricula.turma_id,
          data_inicio: matricula.data_inicio,
          data_fim: matricula.data_fim,
          flag_reposicao: matricula.flag_reposicao,
        }}
      />

      {matricula.status === 'Ativa' && (
        <div className="max-w-2xl border-t border-borda pt-6">
          <h2 className="text-lg">Desmatricular</h2>
          <p className="mb-4 mt-1 text-sm text-tinta-suave">
            Encerra a matrícula hoje. O aluno para de contar nas próximas aulas e nas próximas
            cobranças; o histórico do que já aconteceu não muda.
          </p>
          <EncerrarMatricula id={matricula.id} nome={matricula.aluno_nome} />
        </div>
      )}
    </div>
  )
}
