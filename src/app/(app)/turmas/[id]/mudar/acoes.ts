'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { exigirGestora } from '@/dados/sessao'
import { editarAula, type EdicaoDaAula } from '@/dados/edicao-aula'
import { sincronizarEventoDaTurma } from '@/dados/evento-da-turma'

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
