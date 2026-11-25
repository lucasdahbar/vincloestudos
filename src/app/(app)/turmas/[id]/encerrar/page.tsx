import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterTurma } from '@/dados/turmas'
import { exigirGestora } from '@/dados/sessao'
import { aulasParaVarredura } from '@/dados/varredura'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import type { Acao } from '@/dominio/agenda/varredura'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entradaClasse } from '@/ui/Campo'
import { PreviaDaMudanca } from '../mudar/PreviaDaMudanca'

/**
 * Encerrar com acerto dos alunos (Julio, 25/11/2026). A previa de encerrar
 * (etapa 6c) ficou sem porta quando a tela de editar aulas virou so "editar"
 * (30/10/2026), e o modal de encerrar mandava a Kelly para um botao que nao
 * existia mais. Aqui ela volta, aberta pelo proprio modal quando ha aula ja
 * cobrada: paga vira reposicao ou credito; ainda nao paga sai da cobranca.
 */
const ACAO_ENCERRAR: Acao = { tipo: 'encerrar' }

export default async function PaginaEncerrarTurma({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ data?: string }>
}) {
  await exigirGestora()
  const { id } = await params
  const q = await searchParams
  const turma = await obterTurma(Number(id))
  if (!turma) notFound()

  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const data = q.data && /^\d{4}-\d{2}-\d{2}$/.test(q.data) ? q.data : hoje
  const recorrenteAtiva = turma.tipo_recorrencia === 'Recorrente' && turma.status === 'Ativa'
  const aulas = recorrenteAtiva ? await aulasParaVarredura(turma.id, 'a-partir', { aPartirDe: data }) : []

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href={`/turmas/${turma.id}`} className="text-sm text-tinta-suave hover:text-destaque">
          ← {turma.nome}
        </Link>
        <h1 className="mt-1 text-3xl">Encerrar a turma</h1>
        <p className="mt-1 text-tinta-suave">
          Mostra as aulas que saem e o que fazer com cada aluno. Nada é gravado antes de você aplicar.
        </p>
      </header>

      {!recorrenteAtiva ? (
        <Cartao>
          {turma.status !== 'Ativa'
            ? 'Esta turma já está encerrada.'
            : 'Turma de aula única: use o "Encerrar" da própria turma.'}
        </Cartao>
      ) : (
        <>
          <Cartao>
            <form className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-sm">
                Sem aula a partir de
                <input type="date" name="data" defaultValue={data} className={entradaClasse} />
              </label>
              <Botao type="submit" aparencia="secundario">
                Ver aulas a partir desta data
              </Botao>
            </form>
          </Cartao>

          <PreviaDaMudanca
            // Remonta ao trocar a data: as respostas de uma previa nao valem para outra.
            key={data}
            aulas={aulas}
            acao={ACAO_ENCERRAR}
            escopo="a-partir"
            turmaId={turma.id}
            saida={{ tipo: 'encerrar', data }}
          />
        </>
      )}
    </div>
  )
}
