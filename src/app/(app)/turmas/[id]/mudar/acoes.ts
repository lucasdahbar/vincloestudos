'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { exigirGestora } from '@/dados/sessao'
import { avisarProfessorDaTurma } from '@/dados/avisos-turma'
import { mudarSerie, type ResultadoDaDivisao } from '@/dados/divisao-turma'
import { editarAula, type EdicaoDaAula } from '@/dados/edicao-aula'
import { atualizarAlunosNosEventos, sincronizarEventoDaTurma } from '@/dados/evento-da-turma'
import { encerrarPelaPrevia, excluirPelaPrevia, type ResultadoDaSaida } from '@/dados/saida-de-aulas'
import type { Respostas } from '@/dominio/agenda/varredura'
import type { MudancaDaSerie } from '@/dominio/turmas/divisao'

/**
 * Etapa 6b (29/10/2026): aplica a edicao de "so esta aula". O Google vem
 * depois, como na remarcacao: a aula sai da serie e ganha evento proprio, na
 * agenda do professor dela. Falha do Google nao desfaz a mudanca.
 */
export async function editarEstaAula(
  aulaId: number,
  edicao: EdicaoDaAula,
): Promise<
  { ok: true; avisar: { nome: string; data: string }[] } | { ok: false; erros?: string[]; alerta?: string }
> {
  await exigirGestora()
  const r = await editarAula(aulaId, edicao)
  if (!r.ok) return r

  after(async () => {
    try {
      const s = await sincronizarEventoDaTurma(r.turmaId)
      if (!s.ok) console.warn('evento nao atualizado apos editar a aula:', s.motivo)
    } catch (e) {
      console.error('falha ao atualizar o evento apos editar a aula:', e)
    }
  })

  revalidatePath('/agenda', 'layout')
  revalidatePath(`/turmas/${r.turmaId}`, 'layout')
  revalidatePath('/pagamentos', 'layout')
  return { ok: true, avisar: r.avisar }
}

/**
 * Etapa 6c: excluir "so esta aula" ou encerrar a turma, com o desfecho de
 * cada aluno escolhido na previa (decisao 9). O servidor refaz a varredura
 * antes de gravar.
 */
export async function tirarDaAgenda(
  turmaId: number,
  pedido: { tipo: 'excluir'; aulaId: number } | { tipo: 'encerrar'; data: string },
  respostas: Respostas,
): Promise<ResultadoDaSaida> {
  await exigirGestora()
  const r =
    pedido.tipo === 'excluir'
      ? await excluirPelaPrevia(turmaId, pedido.aulaId, respostas)
      : await encerrarPelaPrevia(turmaId, pedido.data, respostas)

  if (r.ok || r.parcial) {
    // A data vira excecao na serie (ou a serie termina na vespera), e quem
    // vinha repor sai da ocorrencia do dia nas turmas de destino.
    after(async () => {
      try {
        const s = await sincronizarEventoDaTurma(turmaId)
        if (!s.ok) console.warn('evento nao atualizado apos tirar aulas da agenda:', s.motivo)
      } catch (e) {
        console.error('falha ao atualizar o evento apos tirar aulas da agenda:', e)
      }
      if (r.ok) await atualizarAlunosNosEventos(r.turmasAfetadas)
    })
    revalidatePath('/agenda', 'layout')
    revalidatePath('/turmas', 'layout')
    revalidatePath('/reposicoes')
    revalidatePath('/creditos')
    revalidatePath('/cobrancas', 'layout')
    revalidatePath('/matriculas')
  }
  return r
}

/**
 * Etapa 6d: muda a serie a partir de uma data (ou a serie inteira). Com aula
 * antes do corte, a turma termina na vespera e nasce a continuacao; no Google,
 * a serie antiga termina e uma nova comeca, como o proprio Google faz.
 */
export async function mudarSerieDaTurma(
  turmaId: number,
  pedido: { escopo: 'a-partir' | 'serie'; aPartirDe: string; mudanca: MudancaDaSerie },
  respostas: Respostas,
): Promise<ResultadoDaDivisao> {
  await exigirGestora()
  const r = await mudarSerie(turmaId, pedido.escopo, pedido.aPartirDe, pedido.mudanca, respostas)
  if (!r.ok) return r

  // O professor novo recebe o aviso da turma (G4), como numa turma criada.
  let urlBase: string | null = null
  if (pedido.mudanca.professor_id !== undefined) {
    const anfitriao = (await headers()).get('host') ?? ''
    urlBase = anfitriao ? `${anfitriao.startsWith('localhost') ? 'http' : 'https'}://${anfitriao}` : ''
  }

  // Em sequencia: a serie antiga termina antes de a nova nascer, e o aviso le
  // o link da sala que a sincronizacao pode ter acabado de ajustar.
  after(async () => {
    for (const id of r.novaTurma ? [turmaId, r.turmaId] : [turmaId]) {
      try {
        const s = await sincronizarEventoDaTurma(id)
        if (!s.ok) console.warn(`evento da turma ${id} nao atualizado apos mudar a serie:`, s.motivo)
      } catch (e) {
        console.error(`falha ao atualizar o evento da turma ${id} apos mudar a serie:`, e)
      }
    }
    if (urlBase === null) return
    try {
      await avisarProfessorDaTurma(r.turmaId, urlBase)
    } catch (e) {
      console.error('falha ao avisar o professor da turma:', e)
    }
  })

  revalidatePath('/agenda', 'layout')
  revalidatePath('/turmas', 'layout')
  revalidatePath('/matriculas')
  revalidatePath('/cobrancas', 'layout')
  revalidatePath('/pagamentos', 'layout')
  return r
}
