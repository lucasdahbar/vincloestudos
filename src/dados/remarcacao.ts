import 'server-only'
import { clienteServidor } from './cliente'
import { calendarioEscolar } from './calendario'
import { alertaDaData } from '@/dominio/agenda/datas-puladas'
import { idOcorrenciaLocal } from '@/dominio/agenda/materializacao'
import { planejarRemarcacao, type NovoHorario } from '@/dominio/agenda/remarcacao'
import { agoraNaEscola } from '@/dominio/agenda/relogio'

/** Remarcar uma aula (pedido do tio, 13/10/2026; spec 2026-10-13-remarcar-aula). */

const minuto = (v: unknown) => String(v).slice(0, 16)

export type ResultadoRemarcacao =
  | { ok: true; turmaId: number }
  | { ok: false; erros: string[] }
  /** A data nova cai em feriado/recesso: só segue com a confirmação da gestora. */
  | { ok: false; alerta: string }

export async function remarcarAulaNoBanco(
  aulaId: number,
  nova: NovoHorario,
  confirmouAlerta: boolean,
): Promise<ResultadoRemarcacao> {
  const supabase = await clienteServidor()

  const [{ data: aula, error }, { count: presencas, error: erroPresencas }] = await Promise.all([
    supabase
      .from('aulas')
      .select(
        'id, turma_id, status, data_hora_inicio, data_hora_fim, data_hora_original, turma:turmas!turma_id (tipo_recorrencia, horario_fim, escola_id)',
      )
      .eq('id', aulaId)
      .maybeSingle(),
    supabase.from('presencas').select('id', { count: 'exact', head: true }).eq('aula_id', aulaId),
  ])
  if (error || erroPresencas) {
    return { ok: false, erros: ['Não foi possível conferir a aula agora. Tente de novo.'] }
  }
  if (!aula) return { ok: false, erros: ['Esta aula não existe mais.'] }

  const turma = aula.turma as unknown as {
    tipo_recorrencia: 'Recorrente' | 'Único'
    horario_fim: string
    escola_id: number | null
  }
  const original = aula.data_hora_original ? minuto(aula.data_hora_original) : null

  const plano = planejarRemarcacao(
    {
      status: aula.status,
      temPresenca: (presencas ?? 0) > 0,
      inicio: minuto(aula.data_hora_inicio),
      fim: minuto(aula.data_hora_fim),
      original,
      // Termino no horario da regra: o da turma, no dia original.
      fimOriginal: original
        ? `${original.slice(0, 10)}T${String(turma.horario_fim).slice(0, 5)}`
        : minuto(aula.data_hora_fim),
    },
    nova,
    agoraNaEscola(new Date()),
  )
  if (!plano.ok) return plano

  // Feriado ou recesso no dia novo: só avisa, como na aula única.
  if (!confirmouAlerta) {
    const calendario = await calendarioEscolar(supabase, nova.data, nova.data)
    const alerta = alertaDaData(nova.data, turma.escola_id, calendario.feriados, calendario.recessos)
    if (alerta) return { ok: false, alerta }
  }

  if (turma.tipo_recorrencia === 'Único') {
    // A turma de aula única é aquela aula: muda a própria turma, e a chave da
    // aula acompanha — senão a geração automática criaria outra no dia novo.
    const { error: erroTurma } = await supabase
      .from('turmas')
      .update({ data_unica: nova.data, horario_inicio: nova.inicio, horario_fim: nova.fim })
      .eq('id', aula.turma_id)
    if (erroTurma) return { ok: false, erros: [erroTurma.message] }

    const { error: erroAula } = await supabase
      .from('aulas')
      .update({
        data_hora_inicio: plano.inicio,
        data_hora_fim: plano.fim,
        data_hora_original: null,
        google_calendar_event_id: idOcorrenciaLocal(aula.turma_id, nova.data, nova.inicio),
      })
      .eq('id', aulaId)
    if (erroAula) return { ok: false, erros: [erroAula.message] }
    return { ok: true, turmaId: aula.turma_id }
  }

  const { error: erroAula } = await supabase
    .from('aulas')
    .update({ data_hora_inicio: plano.inicio, data_hora_fim: plano.fim, data_hora_original: plano.original })
    .eq('id', aulaId)
    // Se a chamada foi feita no meio do caminho, a aula não muda.
    .eq('status', aula.status)
  if (erroAula) return { ok: false, erros: [erroAula.message] }

  return { ok: true, turmaId: aula.turma_id }
}
