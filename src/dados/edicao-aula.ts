import 'server-only'
import { clienteServidor } from './cliente'
import { aulasParaVarredura } from './varredura'
import { remarcarAulaNoBanco } from './remarcacao'
import { garantirSalaDaAula } from './sala-da-aula'
import { errosDaEdicao, varrer } from '@/dominio/agenda/varredura'
import type { NovoHorario } from '@/dominio/agenda/remarcacao'

export interface EdicaoDaAula {
  /** Dia e horario novos; nulo = nao muda. */
  nova: NovoHorario | null
  /** Professor novo; nulo = nao muda. */
  professorId: number | null
  /**
   * Servico novo; nulo = nao muda. Pedido do Julio (06/11/2026): o pai pede em
   * cima da hora uma aula de 1h30, que e outro servico e outro preco.
   */
  servicoId?: number | null
  /** Modalidade nova; nulo = nao muda. */
  modalidade: 'Presencial' | 'Online' | null
  /** Decisao 5: resposta a "a aula aconteceu?", quando ela passou sem chamada. */
  aconteceu?: boolean
  /** A data nova cai em feriado ou recesso, e a gestora confirmou. */
  confirmouAlerta?: boolean
}

export type ResultadoEdicao =
  | { ok: true; turmaId: number; avisar: { nome: string; data: string }[]; aviso?: string }
  | { ok: false; erros: string[] }
  | { ok: false; alerta: string }

/**
 * Etapa 6b (29/10/2026): editar "so esta aula" — dia, horario, professor,
 * modalidade e (06/11/2026) servico.
 *
 * A varredura roda de novo aqui, com o que esta no banco agora: a previa do
 * navegador pode estar velha. Dia e horario seguem a remarcacao de sempre
 * (`remarcacao.ts`), que move a aula com tudo o que esta preso a ela.
 */
export async function editarAula(aulaId: number, e: EdicaoDaAula): Promise<ResultadoEdicao> {
  const supabase = await clienteServidor()
  const { data: aula, error } = await supabase
    .from('aulas')
    .select('id, turma_id, professor_id, servico_id, modalidade')
    .eq('id', aulaId)
    .maybeSingle()
  if (error) return { ok: false, erros: ['Não foi possível conferir a aula agora. Tente de novo.'] }
  if (!aula) return { ok: false, erros: ['Esta aula não existe mais.'] }

  const trocaProfessor = e.professorId !== null && e.professorId !== aula.professor_id
  const trocaServico = e.servicoId != null && e.servicoId !== aula.servico_id
  const trocaModalidade = e.modalidade !== null && e.modalidade !== aula.modalidade
  const pedido = {
    quando: e.nova !== null,
    professor: trocaProfessor,
    servico: trocaServico,
    modalidade: trocaModalidade,
  }
  if (!pedido.quando && !pedido.professor && !pedido.servico && !pedido.modalidade) {
    return { ok: false, erros: ['Nada mudou nesta aula.'] }
  }

  if (trocaProfessor) {
    const { data: professor } = await supabase
      .from('professores')
      .select('id, ativo')
      .eq('id', e.professorId!)
      .maybeSingle()
    if (!professor?.ativo) return { ok: false, erros: ['Escolha um professor ativo.'] }
  }

  if (trocaServico) {
    const { data: servico } = await supabase
      .from('servicos')
      .select('id, ativo')
      .eq('id', e.servicoId!)
      .maybeSingle()
    if (!servico?.ativo) return { ok: false, erros: ['Escolha um serviço ativo.'] }
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

  if (trocaServico) {
    // Decisao 8 (a varredura ja barrou aula cobrada ou paga): o preco sai do
    // servico da aula na geracao da cobranca, e o rascunho e refeito nela.
    // O gatilho da turma nao desfaz isto: so leva aula que segue a turma.
    const { error: erroServico } = await supabase
      .from('aulas')
      .update({ servico_id: e.servicoId })
      .eq('id', aulaId)
    if (erroServico) {
      return {
        ok: false,
        erros: [
          pedido.quando || pedido.professor
            ? `O resto mudou, mas o serviço não: ${erroServico.message}`
            : `Não foi possível trocar o serviço: ${erroServico.message}`,
        ],
      }
    }
  }

  let aviso: string | undefined
  if (trocaModalidade) {
    const { error: erroModalidade } = await supabase
      .from('aulas')
      .update({ modalidade: e.modalidade })
      .eq('id', aulaId)
    if (erroModalidade) {
      return { ok: false, erros: [`A modalidade não mudou: ${erroModalidade.message}`] }
    }
    // Bug de 09/11/2026: a aula que virou online numa turma presencial ficava
    // sem link. A sala sai antes de responder, para a tela da aula ja abrir
    // com ela; o evento do Google, sincronizado depois, leva o mesmo link.
    const sala = await garantirSalaDaAula(aulaId)
    if (!sala.ok) {
      console.warn('sala do Meet da aula nao criada:', sala.motivo)
      aviso = `A aula mudou, mas a sala do Meet não foi criada (${sala.motivo}). Tente de novo pela tela da aula.`
    }
  }

  return { ok: true, turmaId: aula.turma_id, avisar: pedido.quando ? v.avisar : [], aviso }
}
