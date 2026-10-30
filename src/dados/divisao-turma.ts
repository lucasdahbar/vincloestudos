import 'server-only'
import { clienteServidor } from './cliente'
import { calendarioEscolar } from './calendario'
import { obterTurma } from './turmas'
import { aulasParaVarredura } from './varredura'
import { sincronizarAulas } from './aulas'
import { datasPuladas } from '@/dominio/agenda/datas-puladas'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { varrer, type Respostas } from '@/dominio/agenda/varredura'
import { planoDeDivisao, type AulaDaDivisao, type MudancaDaSerie } from '@/dominio/turmas/divisao'
import { gerarNomeTurma } from '@/dominio/turmas/nome'

export type ResultadoDaDivisao =
  | {
      ok: true
      /** A turma que ficou com a regra nova: a continuacao, ou a propria. */
      turmaId: number
      novaTurma: boolean
      corte: string
      avisar: { nome: string; data: string }[]
      avisos: string[]
    }
  | { ok: false; erros: string[] }

const minuto = (v: unknown) => String(v).slice(0, 16)

/**
 * Etapa 6d (29/10/2026): muda a serie a partir de uma data. Refaz a varredura
 * com as respostas da previa, monta o plano (`dominio/turmas/divisao.ts`) e o
 * grava de uma vez em `dividir_turma`. O Google fica com quem chama.
 */
export async function mudarSerie(
  turmaId: number,
  escopo: 'a-partir' | 'serie',
  aPartirDe: string,
  mudanca: MudancaDaSerie,
  respostas: Respostas,
): Promise<ResultadoDaDivisao> {
  const supabase = await clienteServidor()
  const turma = await obterTurma(turmaId)
  if (!turma) return { ok: false, erros: ['Esta turma não existe mais.'] }

  const { data: lidas, error } = await supabase
    .from('aulas')
    .select('id, status, data_hora_inicio, data_hora_fim, data_hora_original, data_hora_referencia, professor_id, servico_id')
    .eq('turma_id', turmaId)
  if (error) return { ok: false, erros: [error.message] }
  const aulas: AulaDaDivisao[] = (lidas ?? []).map((a) => ({
    id: a.id,
    data: String(a.data_hora_referencia).slice(0, 10),
    inicio: minuto(a.data_hora_inicio),
    fim: minuto(a.data_hora_fim),
    original: a.data_hora_original ? minuto(a.data_hora_original) : null,
    status: a.status,
    professor_id: a.professor_id,
    servico_id: a.servico_id,
  }))

  const v = varrer(
    await aulasParaVarredura(turmaId, escopo, { aPartirDe }),
    {
      tipo: 'editar',
      quando: mudanca.quando !== undefined,
      professor: mudanca.professor_id !== undefined,
      servico: mudanca.servico_id !== undefined,
    },
    escopo,
    respostas,
  )

  const de = turma.data_inicio ?? aPartirDe
  const ate = turma.data_fim ?? aPartirDe
  const calendario = await calendarioEscolar(supabase, de, ate)
  const puladas = new Set(datasPuladas(turma.escola_id, calendario.feriados, calendario.recessos, de, ate).keys())

  const regraDeHoje = {
    tipo_recorrencia: turma.tipo_recorrencia,
    status: turma.status,
    data_inicio: turma.data_inicio ? String(turma.data_inicio).slice(0, 10) : null,
    data_fim: turma.data_fim ? String(turma.data_fim).slice(0, 10) : null,
    dias_semana: turma.dias_semana ?? [],
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    professor_id: turma.professor_id,
    servico_id: turma.servico_id,
  }
  const plano = planoDeDivisao(regraDeHoje, aulas, v, mudanca, { escopo, aPartirDe, puladas })
  if (plano.erros.length > 0) return { ok: false, erros: plano.erros }

  // O nome leva o servico: so muda com ele.
  const servicoId = mudanca.servico_id ?? turma.servico_id
  let nome = turma.nome
  if (servicoId !== turma.servico_id) {
    const { data: servico } = await supabase.from('servicos').select('nome').eq('id', servicoId).maybeSingle()
    if (!servico) return { ok: false, erros: ['Selecione um serviço válido.'] }
    nome = gerarNomeTurma({
      materia: turma.materia?.nome ?? null,
      anoEscolar: turma.ano_escolar?.nome ?? null,
      escola: turma.escola?.nome ?? null,
      servico: servico.nome,
      modalidade: turma.modalidade,
    })
  }

  const quando = mudanca.quando ?? regraDeHoje
  const { data: destino, error: erro } = await supabase.rpc('dividir_turma', {
    p_turma_id: turmaId,
    p_corte: plano.corte,
    p_nova: plano.novaTurma,
    p_regra: {
      nome,
      dias_semana: quando.dias_semana,
      horario_inicio: quando.horario_inicio,
      horario_fim: quando.horario_fim,
      professor_id: mudanca.professor_id ?? turma.professor_id,
      servico_id: servicoId,
    },
    p_aulas: plano.aulas,
  })
  if (erro) return { ok: false, erros: [erro.message] }

  // A regra nova ganha as aulas que faltam na janela da agenda. Do corte (ou
  // de hoje) em diante: no passado, a semana sem aula ficou sem aula.
  try {
    const hoje = agoraNaEscola(new Date()).slice(0, 10)
    const agora = new Date()
    const fimJanela = new Date(agora.getFullYear(), agora.getMonth() + 4, 0)
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await sincronizarAulas(plano.corte > hoje ? plano.corte : hoje, iso(fimJanela))
  } catch (e) {
    // A agenda se recupera sozinha na proxima abertura.
    console.error('falha ao materializar as aulas da regra nova:', e)
  }

  return {
    ok: true,
    turmaId: destino as number,
    novaTurma: plano.novaTurma,
    corte: plano.corte,
    avisar: v.avisar.filter((x) => x.data >= plano.corte),
    avisos: plano.avisos,
  }
}
