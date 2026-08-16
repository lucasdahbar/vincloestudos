'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { enfileirarBoasVindas } from '@/dados/notificacoes'
import { validarMatricula } from '@/dominio/matriculas/regras'

export async function salvarMatricula(entrada: {
  aluno_id: number | null
  turma_id: number | null
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
}): Promise<{ ok: boolean; erros?: string[] }> {
  await exigirGestora()
  const supabase = await clienteServidor()

  const [{ data: aluno }, { data: turma }] = await Promise.all([
    supabase.from('alunos').select('ativo').eq('id', entrada.aluno_id ?? -1).maybeSingle(),
    supabase.from('turmas').select('status').eq('id', entrada.turma_id ?? -1).maybeSingle(),
  ])

  if (!aluno) return { ok: false, erros: ['Selecione um aluno válido.'] }
  if (!turma) return { ok: false, erros: ['Selecione uma turma válida.'] }

  const erros = validarMatricula({ ...entrada, alunoAtivo: aluno.ativo }, turma)
  if (erros.length > 0) return { ok: false, erros }

  const { data: criada, error } = await supabase
    .from('matriculas')
    .insert({
      aluno_id: entrada.aluno_id,
      turma_id: entrada.turma_id,
      data_inicio: entrada.data_inicio,
      data_fim: entrada.data_fim,
      flag_reposicao: entrada.flag_reposicao,
    })
    .select('id')
    .single()

  if (error) return { ok: false, erros: [error.message] }

  // Boas-vindas com os dados da turma (Operacionais 4.5). Nao pode derrubar a
  // matricula: se a fila falhar, o vinculo ja esta gravado e e o que importa.
  try {
    await enfileirarBoasVindas(criada.id)
  } catch (e) {
    console.error('falha ao enfileirar boas-vindas:', e)
  }

  revalidatePath('/matriculas')
  revalidatePath('/mensagens')
  revalidatePath(`/turmas/${entrada.turma_id}`)
  return { ok: true }
}

export async function encerrarMatricula(id: number) {
  await exigirGestora()
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('matriculas')
    .update({ status: 'Encerrada', data_fim: new Date().toISOString().slice(0, 10) })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/matriculas')
}
