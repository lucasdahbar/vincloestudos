import 'server-only'
import { clienteServidor } from './cliente'
import { criarSala } from '@/agenda/meet'
import { aulaPrecisaDeSala } from '@/dominio/agenda/meet'

/**
 * Bug de 09/11/2026: a aula de turma presencial que virou online (editar "so
 * esta aula") ficava sem link. Ela ganha uma sala do Meet so dela, gravada em
 * `aulas.link_online`, com o professor da aula como coorganizador (G3).
 *
 * Nao estoura: a aula ja esta salva, e a sala e reflexo dela. Sem sala, a tela
 * da aula oferece criar de novo.
 */
export async function garantirSalaDaAula(
  aulaId: number,
): Promise<{ ok: true; criada: boolean } | { ok: false; motivo: string }> {
  const supabase = await clienteServidor()
  const { data: aula, error } = await supabase
    .from('aulas')
    .select(
      'id, status, modalidade, link_online, professor:professores!professor_id (email), turma:turmas!turma_id (modalidade, link_videochamada)',
    )
    .eq('id', aulaId)
    .maybeSingle()
  if (error || !aula) return { ok: false, motivo: 'Não foi possível conferir a aula agora.' }

  const turma = aula.turma as unknown as {
    modalidade: 'Presencial' | 'Online'
    link_videochamada: string | null
  } | null
  if (!turma || !aulaPrecisaDeSala(aula, turma)) return { ok: true, criada: false }

  const professor = aula.professor as unknown as { email: string | null } | null
  const r = await criarSala(professor?.email ?? null)
  if (!r.ok) return { ok: false, motivo: r.motivo }
  if (r.motivoCoorganizador) console.warn('coorganizador da sala da aula nao definido:', r.motivoCoorganizador)

  // So grava se ninguem gravou um link no meio tempo (dois cliques seguidos).
  const { error: erroGravar } = await supabase
    .from('aulas')
    .update({ link_online: r.link })
    .eq('id', aulaId)
    .is('link_online', null)
  if (erroGravar) return { ok: false, motivo: `A sala foi criada, mas o link não foi gravado: ${erroGravar.message}` }
  return { ok: true, criada: true }
}
