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
import { PreviaDaMudanca, type DadosDaEdicao, type DadosDaSerie } from './PreviaDaMudanca'

/**
 * Etapa 6a (29/10/2026): a previa de editar aulas. A gestora escolhe o escopo
 * e ve aula por aula o que muda, o que precisa de escolha e o que fica como
 * esta. Aplicar chegou por partes: 6b editar so esta aula, 6d a serie a
 * partir de uma data. Excluir e encerrar saem por outros caminhos (botao na
 * aula e na turma).
 *
 * Extensao de 30/10/2026: o seletor "O que mudar" saiu — editar e sempre
 * "tudo junto" (dia/horario, professor, servico, modalidade); cada campo so
 * aparece se a aula (ou a regra da serie) liberar.
 */
const ACAO_EDITAR: Acao = { tipo: 'editar', quando: true, professor: true, servico: true, modalidade: true }

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
  searchParams: Promise<{ escopo?: string; data?: string; aula?: string }>
}) {
  await exigirGestora()
  const { id } = await params
  const q = await searchParams
  const turma = await obterTurma(Number(id))
  if (!turma) notFound()

  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const aulaId = q.aula ? Number(q.aula) : undefined
  const escopo: Escopo =
    q.escopo && q.escopo in ESCOPOS && (q.escopo !== 'esta' || aulaId)
      ? (q.escopo as Escopo)
      : aulaId
        ? 'esta'
        : 'a-partir'
  const data = q.data && /^\d{4}-\d{2}-\d{2}$/.test(q.data) ? q.data : hoje
  const aulas = await aulasParaVarredura(turma.id, escopo, { aulaId, aPartirDe: data })

  // "So esta aula" ja aplica dia/horario, professor, servico e modalidade.
  let edicao: DadosDaEdicao | undefined
  let semAplicar: string | undefined
  if (escopo === 'esta' && aulaId) {
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
        // Extensao de 30/10/2026: a modalidade da propria aula, que pode
        // diferir da modalidade atual da turma.
        modalidade: aula.modalidade,
      }
    }
  }

  // Dia/horario, professor, servico e modalidade na serie, a partir de uma
  // data ou inteira.
  let serie: DadosDaSerie | undefined
  if (escopo !== 'esta') {
    if (turma.tipo_recorrencia !== 'Recorrente') {
      semAplicar = 'Turma de aula única: mude a aula pelo "Só esta aula", a partir da aula na agenda.'
    } else if (turma.status !== 'Ativa') {
      semAplicar = 'Esta turma está encerrada.'
    } else {
      const opcoes = await opcoesDeTurma()
      serie = {
        escopo,
        aPartirDe: data,
        diasSemana: turma.dias_semana,
        horarioInicio: turma.horario_inicio.slice(0, 5),
        horarioFim: turma.horario_fim.slice(0, 5),
        professorId: turma.professor_id,
        servicoId: turma.servico_id,
        modalidade: turma.modalidade,
        professores: opcoes.professores.some((p) => p.id === turma.professor_id)
          ? opcoes.professores
          : [{ id: turma.professor_id, nome: turma.professor?.nome ?? 'Professor atual' }, ...opcoes.professores],
        servicos: opcoes.servicos.map((s) => ({ id: s.id, nome: s.nome })),
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href={`/turmas/${turma.id}`} className="text-sm text-tinta-suave hover:text-destaque">
          ← {turma.nome}
        </Link>
        <h1 className="mt-1 text-3xl">Editar aula</h1>
        <p className="mt-1 text-tinta-suave">
          Mostra, aula por aula, o que aconteceria. Nada é gravado antes de você aplicar.
        </p>
      </header>

      <Cartao>
        <form className="flex flex-wrap items-end gap-4">
          {aulaId && <input type="hidden" name="aula" value={aulaId} />}
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
      </Cartao>

      <PreviaDaMudanca
        // Remonta ao trocar a pergunta: as respostas de uma previa nao valem para outra.
        key={`${escopo}:${data}:${aulaId ?? ''}`}
        aulas={aulas}
        acao={ACAO_EDITAR}
        escopo={escopo}
        edicao={edicao}
        turmaId={turma.id}
        serie={serie}
        semAplicar={semAplicar}
      />
    </div>
  )
}
