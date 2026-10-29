import 'server-only'
import { clienteServidor } from './cliente'
import { aulasParaVarredura } from './varredura'
import { remarcarAulaNoBanco } from './remarcacao'
import { errosDaEdicao, varrer } from '@/dominio/agenda/varredura'
import type { NovoHorario } from '@/dominio/agenda/remarcacao'

export interface EdicaoDaAula {
  /** Dia e horario novos; nulo = nao muda. */
  nova: NovoHorario | null
  /** Professor novo; nulo = nao muda. */
  professorId: number | null
  /** Decisao 5: resposta a "a aula aconteceu?", quando ela passou sem chamada. */
  aconteceu?: boolean
  /** A data nova cai em feriado ou recesso, e a gestora confirmou. */
  confirmouAlerta?: boolean
}

export type ResultadoEdicao =
  | { ok: true; turmaId: number; avisar: { nome: string; data: string }[] }
  | { ok: false; erros: string[] }
  | { ok: false; alerta: string }

/**
 * Etapa 6b (29/10/2026): editar "so esta aula" — dia, horario e professor.
 *
 * A varredura roda de novo aqui, com o que esta no banco agora: a previa do
 * navegador pode estar velha. Dia e horario seguem a remarcacao de sempre
 * (`remarcacao.ts`), que move a aula com tudo o que esta preso a ela.
 */
export async function editarAula(aulaId: number, e: EdicaoDaAula): Promise<ResultadoEdicao> {
  const supabase = await clienteServidor()
  const { data: aula, error } = await supabase
    .from('aulas')
    .select('id, turma_id, professor_id')
    .eq('id', aulaId)
    .maybeSingle()
  if (error) return { ok: false, erros: ['Não foi possível conferir a aula agora. Tente de novo.'] }
  if (!aula) return { ok: false, erros: ['Esta aula não existe mais.'] }

  const trocaProfessor = e.professorId !== null && e.professorId !== aula.professor_id
  const pedido = { quando: e.nova !== null, professor: trocaProfessor }
  if (!pedido.quando && !pedido.professor) return { ok: false, erros: ['Nada mudou nesta aula.'] }

  if (trocaProfessor) {
    const { data: professor } = await supabase
      .from('professores')
      .select('id, ativo')
      .eq('id', e.professorId!)
      .maybeSingle()
    if (!professor?.ativo) return { ok: false, erros: ['Escolha um professor ativo.'] }
  }

  const fatos = await aulasParaVarredura(aula.turma_id, 'esta', { aulaId })
  const v = varrer(
    fatos,
    { tipo: 'editar', ...pedido },
    'esta',
    e.aconteceu === undefined ? {} : { aconteceu: { [aulaId]: e.aconteceu } },
  )
  const erros = errosDaEdicao(v.aulas[0], pedido)
  if (erros.length > 0) return { ok: false, erros }

  // Primeiro o horario: e ele que pode parar para pedir a confirmacao de
  // feriado, e nada pode ter sido gravado antes disso.
  if (e.nova) {
    const r = await remarcarAulaNoBanco(aulaId, e.nova, e.confirmouAlerta === true)
    if (!r.ok) return r
  }

  if (trocaProfessor) {
    const { error: erroProfessor } = await supabase
      .from('aulas')
      .update({ professor_id: e.professorId })
      .eq('id', aulaId)
    if (erroProfessor) {
      return {
        ok: false,
        erros: [
          e.nova
            ? `O dia e o horário mudaram, mas o professor não: ${erroProfessor.message}`
            : `Não foi possível trocar o professor: ${erroProfessor.message}`,
        ],
      }
    }
    // O link da chamada que ainda nao foi usado era do professor anterior.
    await supabase.from('presenca_tokens').delete().eq('aula_id', aulaId).is('usado_em', null)
  }

  return { ok: true, turmaId: aula.turma_id, avisar: pedido.quando ? v.avisar : [] }
}
