import 'server-only'
import { clienteAdmin } from './admin'
import { apagarEvento, sincronizarEvento } from '@/agenda/eventos'

/**
 * G2 (Rodada 2): mantém o evento da turma na agenda do professor.
 *
 * Chamado depois de salvar a turma, em `after()`. Nada aqui pode derrubar o
 * salvamento: a turma é o dado do negócio e já está gravada; o evento é
 * reflexo dela. Se o Google estiver fora, a próxima edição refaz.
 */
export async function sincronizarEventoDaTurma(
  turmaId: number,
): Promise<{ ok: boolean; motivo?: string }> {
  if (process.env.GOOGLE_CALENDAR_ATIVO !== 'true') {
    return { ok: false, motivo: 'A integração com o Google Agenda está desligada.' }
  }

  const admin = clienteAdmin()
  const { data: turma } = await admin
    .from('turmas')
    .select(
      'id, nome, tipo_recorrencia, data_unica, dias_semana, horario_inicio, horario_fim, modalidade, status, google_calendar_event_id, professor:professores!professor_id (email, google_calendar_id)',
    )
    .eq('id', turmaId)
    .maybeSingle()

  if (!turma) return { ok: false, motivo: 'Turma não encontrada.' }

  const professor = turma.professor as unknown as
    | { email: string | null; google_calendar_id: string | null }
    | null

  // Turma encerrada some da agenda: deixar o evento seria o professor
  // continuar vendo aula que não vai acontecer.
  if (turma.status !== 'Ativa') {
    if (turma.google_calendar_event_id && professor?.google_calendar_id) {
      const r = await apagarEvento(professor.google_calendar_id, turma.google_calendar_event_id)
      if (r.ok) {
        await admin.from('turmas').update({ google_calendar_event_id: null }).eq('id', turmaId)
      }
      return r
    }
    return { ok: true }
  }

  // A recorrência começa hoje: criar o evento retroativo encheria a agenda do
  // professor de aulas passadas que ele já deu.
  const hoje = new Date()
  const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

  const r = await sincronizarEvento({
    nome: turma.nome,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_unica: turma.data_unica,
    dias_semana: turma.dias_semana ?? [],
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    modalidade: turma.modalidade,
    inicio_recorrencia: inicio,
    professor_email: professor?.email ?? null,
    google_calendar_id: professor?.google_calendar_id ?? null,
    evento_id: turma.google_calendar_event_id,
  })

  if (!r.ok) return r

  if (r.eventoId !== turma.google_calendar_event_id) {
    await admin.from('turmas').update({ google_calendar_event_id: r.eventoId }).eq('id', turmaId)
  }

  return { ok: true }
}
