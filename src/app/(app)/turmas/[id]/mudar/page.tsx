import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterTurma, opcoesDeTurma } from '@/dados/turmas'
import { obterAula } from '@/dados/aulas'
import { exigirGestora } from '@/dados/sessao'
import { aulasParaVarredura } from '@/dados/varredura'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import type { Acao, Escopo } from '@/dominio/agenda/varredura'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entradaClasse } from '@/ui/Campo'
import { PreviaDaMudanca, type DadosDaEdicao } from './PreviaDaMudanca'

/**
 * Etapa 6a (29/10/2026): a previa de editar, excluir e encerrar, sem gravar
 * nada. A gestora escolhe o que muda e o escopo, e ve aula por aula o que
 * muda, o que precisa de escolha e o que fica como esta. Aplicar chega nas
 * partes seguintes (6b a 6d).
 */

const ACOES = {
  quando: { rotulo: 'Dia ou horário', acao: { tipo: 'editar', quando: true } },
  professor: { rotulo: 'Professor', acao: { tipo: 'editar', professor: true } },
  servico: { rotulo: 'Serviço (e o preço)', acao: { tipo: 'editar', servico: true } },
  excluir: { rotulo: 'Excluir aulas', acao: { tipo: 'excluir' } },
  encerrar: { rotulo: 'Encerrar a turma', acao: { tipo: 'excluir' } },
} satisfies Record<string, { rotulo: string; acao: Acao }>
type ChaveAcao = keyof typeof ACOES

const ESCOPOS: Record<Escopo, string> = {
  esta: 'Só esta aula',
  'a-partir': 'A partir de uma data',
  serie: 'A série inteira',
}

export default async function PaginaMudarTurma({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ acao?: string; escopo?: string; data?: string; aula?: string }>
}) {
  await exigirGestora()
  const { id } = await params
  const q = await searchParams
  const turma = await obterTurma(Number(id))
  if (!turma) notFound()

  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const aulaId = q.aula ? Number(q.aula) : undefined
  const chave: ChaveAcao = q.acao && q.acao in ACOES ? (q.acao as ChaveAcao) : 'quando'
  // Encerrar e sempre "a partir de uma data": o primeiro dia sem aula.
  const escopo: Escopo =
    chave === 'encerrar'
      ? 'a-partir'
      : q.escopo && q.escopo in ESCOPOS && (q.escopo !== 'esta' || aulaId)
        ? (q.escopo as Escopo)
        : aulaId
          ? 'esta'
          : 'a-partir'
  const data = q.data && /^\d{4}-\d{2}-\d{2}$/.test(q.data) ? q.data : hoje
  const aulas = await aulasParaVarredura(turma.id, escopo, { aulaId, aPartirDe: data })

  // Etapa 6b: "so esta aula" ja aplica dia/horario e professor.
  let edicao: DadosDaEdicao | undefined
  if (escopo === 'esta' && aulaId && (chave === 'quando' || chave === 'professor')) {
    const [aula, opcoes] = await Promise.all([obterAula(aulaId), opcoesDeTurma()])
    if (aula && aula.turma_id === turma.id) {
      const professores = opcoes.professores.some((p) => p.id === aula.professor_id)
        ? opcoes.professores
        : [{ id: aula.professor_id, nome: 'Professor atual (inativo)' }, ...opcoes.professores]
      edicao = {
        aulaId,
        inicio: String(aula.data_hora_inicio).slice(0, 16),
        fim: String(aula.data_hora_fim).slice(0, 16),
        professorId: aula.professor_id,
        professores,
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href={`/turmas/${turma.id}`} className="text-sm text-tinta-suave hover:text-destaque">
          ← {turma.nome}
        </Link>
        <h1 className="mt-1 text-3xl">Prévia de mudança</h1>
        <p className="mt-1 text-tinta-suave">
          Mostra, aula por aula, o que aconteceria. Nada é gravado nesta tela.
        </p>
      </header>

      <Cartao>
        <form className="flex flex-wrap items-end gap-4">
          {aulaId && <input type="hidden" name="aula" value={aulaId} />}
          <label className="flex flex-col gap-1 text-sm">
            O que mudar
            <select name="acao" defaultValue={chave} className={entradaClasse}>
              {Object.entries(ACOES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Quais aulas
            <select name="escopo" defaultValue={escopo} className={entradaClasse}>
              {Object.entries(ESCOPOS)
                .filter(([k]) => k !== 'esta' || aulaId)
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            A partir de
            <input type="date" name="data" defaultValue={data} className={entradaClasse} />
          </label>
          <Botao type="submit" aparencia="secundario">
            Ver prévia
          </Botao>
        </form>
        {chave === 'encerrar' && (
          <p className="mt-3 text-sm text-tinta-suave">
            Encerrar tira da agenda as aulas a partir da data (o primeiro dia sem aula) e termina as
            matrículas na véspera.
          </p>
        )}
      </Cartao>

      <PreviaDaMudanca
        // Remonta ao trocar a pergunta: as respostas de uma previa nao valem para outra.
        key={`${chave}:${escopo}:${data}:${aulaId ?? ''}`}
        aulas={aulas}
        acao={ACOES[chave].acao}
        escopo={escopo}
        edicao={edicao}
      />
    </div>
  )
}
