'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/dados/cliente'
import { sincronizarAulas } from '@/dados/aulas'
import { exigirGestora } from '@/dados/sessao'
import { validarTurma, type EntradaTurma } from '@/dominio/turmas/regras'
import { gerarNomeTurma } from '@/dominio/turmas/nome'

export interface ResultadoTurma {
  ok: boolean
  erros?: string[]
  id?: number
}

export async function salvarTurma(
  id: number | null,
  entrada: EntradaTurma,
  nomesParaTitulo: {
    materia: string | null
    anoEscolar: string | null
    escola: string | null
    servico: string | null
  },
): Promise<ResultadoTurma> {
  await exigirGestora()
  const supabase = await clienteServidor()

  const { data: servico } = await supabase
    .from('servicos')
    .select('permite_materia, permite_escola')
    .eq('id', entrada.servico_id ?? -1)
    .maybeSingle()

  if (!servico) return { ok: false, erros: ['Selecione um serviço válido.'] }

  const erros = validarTurma(entrada, servico)
  if (erros.length > 0) return { ok: false, erros }

  const registro = {
    nome: gerarNomeTurma({ ...nomesParaTitulo, modalidade: entrada.modalidade }),
    servico_id: entrada.servico_id,
    materia_id: entrada.materia_id,
    escola_id: entrada.escola_id,
    ano_escolar_id: entrada.ano_escolar_id,
    professor_id: entrada.professor_id,
    modalidade: entrada.modalidade,
    dias_semana: entrada.dias_semana,
    horario_inicio: entrada.horario_inicio,
    horario_fim: entrada.horario_fim,
    status: entrada.status,
  }

  const resposta =
    id === null
      ? await supabase.from('turmas').insert(registro).select('id').single()
      : await supabase.from('turmas').update(registro).eq('id', id).select('id').single()

  if (resposta.error) return { ok: false, erros: [resposta.error.message] }

  // Materializa as aulas na hora. Sem isto a turma nasce vazia: a gestora
  // cadastra, abre a agenda e nao ve nada — parece que o sistema perdeu o
  // cadastro. Foi o que aconteceu com duas turmas reais.
  try {
    const hoje = new Date()
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 4, 0)
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await sincronizarAulas(iso(hoje), iso(fim))
  } catch (e) {
    // Nao derruba o salvamento: a turma ja esta gravada, e a agenda se
    // recupera sozinha na proxima abertura.
    console.error('falha ao materializar aulas da turma:', e)
  }

  revalidatePath('/turmas')
  revalidatePath('/agenda')
  return { ok: true, id: resposta.data.id }
}

export async function alternarStatusTurma(id: number, status: 'Ativa' | 'Encerrada') {
  await exigirGestora()
  const supabase = await clienteServidor()
  const { error } = await supabase.from('turmas').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/turmas')
  revalidatePath(`/turmas/${id}`)
}
