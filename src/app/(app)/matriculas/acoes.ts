'use server'

import { revalidatePath } from 'next/cache'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { enfileirarBoasVindas } from '@/dados/notificacoes'
import { validarMatricula } from '@/dominio/matriculas/regras'

export interface EntradaDeMatricula {
  aluno_id: number | null
  turma_id: number | null
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
}

export async function salvarMatricula(
  entrada: EntradaDeMatricula,
  /** M1/M2: `null` cria; um id edita a matricula existente. */
  id: number | null = null,
): Promise<{ ok: boolean; erros?: string[]; id?: number }> {
  await exigirGestora()
  const supabase = await clienteServidor()

  const [{ data: aluno }, { data: turma }, { data: existentes }] = await Promise.all([
    supabase.from('alunos').select('ativo').eq('id', entrada.aluno_id ?? -1).maybeSingle(),
    supabase.from('turmas').select('status').eq('id', entrada.turma_id ?? -1).maybeSingle(),
    // M1: as outras matriculas do mesmo par (aluno, turma). O trigger no banco
    // e a garantia final; aqui o erro sai na linguagem da gestora, e antes de
    // ela perder o que digitou.
    supabase
      .from('matriculas')
      .select('id, data_inicio, data_fim')
      .eq('aluno_id', entrada.aluno_id ?? -1)
      .eq('turma_id', entrada.turma_id ?? -1),
  ])

  if (!aluno) return { ok: false, erros: ['Selecione um aluno válido.'] }
  if (!turma) return { ok: false, erros: ['Selecione uma turma válida.'] }

  const erros = validarMatricula(
    { ...entrada, id, alunoAtivo: aluno.ativo },
    // Editar uma matricula de turma encerrada tem de continuar possivel: a
    // regra de turma ativa vale para matricula nova.
    id === null ? turma : { status: 'Ativa' },
    existentes ?? [],
  )
  if (erros.length > 0) return { ok: false, erros }

  const registro = {
    aluno_id: entrada.aluno_id,
    turma_id: entrada.turma_id,
    data_inicio: entrada.data_inicio,
    data_fim: entrada.data_fim,
    flag_reposicao: entrada.flag_reposicao,
  }

  const resposta =
    id === null
      ? await supabase.from('matriculas').insert(registro).select('id').single()
      : await supabase.from('matriculas').update(registro).eq('id', id).select('id').single()

  if (resposta.error) return { ok: false, erros: [traduzir(resposta.error.message)] }

  // Boas-vindas com os dados da turma (Operacionais 4.5). Nao pode derrubar a
  // matricula: se a fila falhar, o vinculo ja esta gravado e e o que importa.
  if (id === null) {
    try {
      await enfileirarBoasVindas(resposta.data.id)
    } catch (e) {
      console.error('falha ao enfileirar boas-vindas:', e)
    }
  }

  revalidatePath('/matriculas')
  revalidatePath('/mensagens')
  revalidatePath(`/turmas/${entrada.turma_id}`)
  if (id !== null) revalidatePath(`/matriculas/${id}`)
  return { ok: true, id: resposta.data.id }
}

/**
 * O trigger de sobreposicao (M1) responde em portugues, mas o Postgres embrulha
 * a mensagem. A gestora nao pode ver "P0001" nem o nome da funcao.
 */
function traduzir(mensagem: string): string {
  if (mensagem.includes('matrícula nesta turma no período')) {
    return 'Este aluno já possui uma matrícula nesta turma no período informado. Encerre a matrícula atual antes de criar uma nova.'
  }
  return mensagem
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
  revalidatePath(`/matriculas/${id}`)
}
