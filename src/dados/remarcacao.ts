import 'server-only'
import { clienteServidor } from './cliente'
import { calendarioEscolar } from './calendario'
import { alertaDaData } from '@/dominio/agenda/datas-puladas'
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

  // Uma gravação só, também na turma de aula única: a turma fica como está
  // (a data dela é a original) e a aula guarda o horário de antes. Mudar a
  // turma junto exigiria trocar a chave da aula, e a reposição marcada nela
  // (matrícula só na data original) cairia da lista.
  const { data: gravadas, error: erroAula } = await supabase
    .from('aulas')
    .update({ data_hora_inicio: plano.inicio, data_hora_fim: plano.fim, data_hora_original: plano.original })
    .eq('id', aulaId)
    // Se a chamada foi feita no meio do caminho, a aula não muda.
    .eq('status', 'Agendada')
    .select('id')
  if (erroAula) return { ok: false, erros: [erroAula.message] }
  if (!gravadas || gravadas.length === 0) {
    return { ok: false, erros: ['A aula mudou enquanto a remarcação era feita. Abra a aula de novo.'] }
  }

  // Lembrete já na fila foi montado com o dia antigo: sai, e o próximo
  // enfileiramento o refaz com o dia novo.
  await supabase
    .from('notificacoes')
    .delete()
    .eq('referencia_tipo', 'aulas')
    .eq('referencia_id', aulaId)
    .in('status', ['Pendente', 'Pronta'])

  return { ok: true, turmaId: aula.turma_id }
}
