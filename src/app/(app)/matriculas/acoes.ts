'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { clienteServidor } from '@/dados/cliente'
import { atualizarAlunosNosEventos } from '@/dados/evento-da-turma'
import { exigirGestora } from '@/dados/sessao'
import { acertarCobrancasDaSaida } from '@/dados/creditos'
import { formatarBRL } from '@/dominio/dinheiro'
import { enfileirarBoasVindas } from '@/dados/notificacoes'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { comoDesmatricular, mandaBoasVindas, matriculaParaAntecipar, validarMatricula } from '@/dominio/matriculas/regras'
import { erroDeAulaComChamada, erroDePeriodoSemAula } from '@/dominio/matriculas/periodo'

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
  /** A gestora viu a sugestao de antecipar e quer mesmo uma matricula separada. */
  separadaMesmo = false,
): Promise<{
  ok: boolean
  erros?: string[]
  id?: number
  antecipar?: { id: number; data_inicio: string }
  /** O que mudou na cobranca por causa da edicao (decisao 11). */
  aviso?: string
}> {
  await exigirGestora()
  const supabase = await clienteServidor()

  const [{ data: aluno }, { data: turma }, { data: existentes }, { data: anterior }, { data: aulas }] = await Promise.all([
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
    // A turma de antes da edicao: se a matricula mudou de turma, o aluno sai
    // do evento da antiga.
    supabase.from('matriculas').select('turma_id, data_inicio, data_fim').eq('id', id ?? -1).maybeSingle(),
    supabase
      .from('aulas')
      .select('id, status, data_hora_inicio, data_hora_referencia')
      .eq('turma_id', entrada.turma_id ?? -1),
  ])

  if (!aluno) return { ok: false, erros: ['Selecione um aluno válido.'] }
  if (!turma) return { ok: false, erros: ['Selecione uma turma válida.'] }

  // Antes da validacao: a matricula nova em aberto sobrepoe a futura, e o erro
  // de sobreposicao esconderia a saida certa, que e antecipar.
  if (!separadaMesmo) {
    const alvo = matriculaParaAntecipar({ ...entrada, id, alunoAtivo: aluno.ativo }, existentes ?? [])
    if (alvo?.id != null) return { ok: false, antecipar: { id: alvo.id, data_inicio: alvo.data_inicio } }
  }

  const erros = validarMatricula(
    { ...entrada, id, alunoAtivo: aluno.ativo },
    // Editar uma matricula de turma encerrada tem de continuar possivel: a
    // regra de turma ativa vale para matricula nova.
    id === null ? turma : { status: 'Ativa' },
    existentes ?? [],
  )
  if (erros.length > 0) return { ok: false, erros }

  // So na matricula nova ou quando as datas mudam: editar outra coisa numa
  // matricula antiga (cujas aulas ja foram excluidas, por exemplo) continua
  // possivel.
  const datasMudaram =
    !anterior ||
    anterior.turma_id !== entrada.turma_id ||
    String(anterior.data_inicio).slice(0, 10) !== entrada.data_inicio ||
    (anterior.data_fim ? String(anterior.data_fim).slice(0, 10) : null) !== entrada.data_fim
  if (datasMudaram) {
    const dia = (v: unknown) => String(v).slice(0, 10)
    const semAula = erroDePeriodoSemAula(
      entrada,
      (aulas ?? []).map((a) => ({
        referencia: dia(a.data_hora_referencia ?? a.data_hora_inicio),
        real: dia(a.data_hora_inicio),
        status: a.status,
      })),
    )
    if (semAula) return { ok: false, erros: [semAula] }

    // Decisao 12 (28/10/2026): a chamada feita fecha a aula para matricula nova.
    const noPeriodo = (aulas ?? []).filter((a) => {
      const d = dia(a.data_hora_referencia ?? a.data_hora_inicio)
      return d >= entrada.data_inicio && (entrada.data_fim === null || d <= entrada.data_fim)
    })
    const { data: chamadas } = noPeriodo.length
      ? await supabase.from('presencas').select('aula_id, aluno_id').in('aula_id', noPeriodo.map((a) => a.id))
      : { data: [] }
    const mesmaTurma = anterior && anterior.turma_id === entrada.turma_id
    const fechada = erroDeAulaComChamada(
      entrada,
      mesmaTurma
        ? { data_inicio: dia(anterior.data_inicio), data_fim: anterior.data_fim ? dia(anterior.data_fim) : null }
        : null,
      noPeriodo.map((a) => ({
        referencia: dia(a.data_hora_referencia ?? a.data_hora_inicio),
        real: dia(a.data_hora_inicio),
        status: a.status,
        comChamada: (chamadas ?? []).some((c) => c.aula_id === a.id),
        alunoNaChamada: (chamadas ?? []).some((c) => c.aula_id === a.id && c.aluno_id === entrada.aluno_id),
      })),
    )
    if (fechada) return { ok: false, erros: [fechada] }
  }

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
  // Boas-vindas com os dados da turma (Operacionais 4.5), menos na aula avulsa.
  // Nao pode derrubar a matricula: se a fila falhar, o vinculo ja esta gravado
  // e e o que importa.
  if (id === null && mandaBoasVindas(entrada)) {
    try {
      await enfileirarBoasVindas(resposta.data.id)
    } catch (e) {
      console.error('falha ao enfileirar boas-vindas:', e)
    }
  }

  // Decisao 11 (28/10/2026): a edicao que encolhe a matricula (ou a muda de
  // turma) deixa aulas cobradas de fora, e elas viram credito.
  let aviso: string | undefined
  if (id !== null && datasMudaram && entrada.aluno_id !== null) {
    const turmasDoAcerto = [...new Set([entrada.turma_id, anterior?.turma_id])].filter(
      (t): t is number => typeof t === 'number',
    )
    for (const t of turmasDoAcerto) {
      const r = await acertarCobrancasDaSaida(entrada.aluno_id, t)
      aviso = juntarAviso(aviso, r)
    }
  }

  // O nome do aluno na descricao do evento da turma, no Google Agenda. Depois
  // da resposta: o Google lento ou fora nao pode segurar a matricula.
  const turmasAfetadas = [entrada.turma_id, anterior?.turma_id].filter(
    (t): t is number => typeof t === 'number',
  )
  after(() => atualizarAlunosNosEventos([...new Set(turmasAfetadas)]))

  revalidatePath('/matriculas')
  revalidatePath('/mensagens')
  revalidatePath(`/turmas/${entrada.turma_id}`)
  if (id !== null) revalidatePath(`/matriculas/${id}`)
  if (aviso) revalidatePath('/creditos')
  return { ok: true, id: resposta.data.id, aviso }
}

/** O que o acerto da saida fez, numa frase para a gestora. */
function juntarAviso(
  anterior: string | undefined,
  r: Awaited<ReturnType<typeof acertarCobrancasDaSaida>>,
): string | undefined {
  const partes: string[] = anterior ? [anterior] : []
  if (!r.ok) {
    partes.push(`A matrícula foi salva, mas o acerto da cobrança falhou: ${r.erros?.join(' ')} Avise o suporte.`)
  } else {
    if (r.aulasCreditadas > 0) {
      partes.push(
        `${r.aulasCreditadas === 1 ? '1 aula já cobrada virou' : `${r.aulasCreditadas} aulas já cobradas viraram`} crédito de ${formatarBRL(r.creditado)} para o responsável, em Créditos.`,
      )
    }
    if (r.tiradas > 0) {
      partes.push(`${r.tiradas === 1 ? '1 aula saiu' : `${r.tiradas} aulas saíram`} do rascunho de cobrança.`)
    }
  }
  return partes.length ? partes.join(' ') : undefined
}

/** Caso Giovana: muda so o inicio da matricula que ja existia, com as mesmas validacoes. */
export async function anteciparMatricula(id: number, data_inicio: string) {
  await exigirGestora()
  const supabase = await clienteServidor()
  const { data: atual } = await supabase
    .from('matriculas')
    .select('aluno_id, turma_id, data_fim, flag_reposicao')
    .eq('id', id)
    .maybeSingle()
  if (!atual) return { ok: false, erros: ['Matrícula não encontrada.'] }
  return salvarMatricula({ ...atual, data_inicio }, id)
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
  const { data: atual, error: erroLeitura } = await supabase
    .from('matriculas')
    .select('aluno_id, turma_id, data_inicio')
    .eq('id', id)
    .single()
  if (erroLeitura) return { ok: false as const, motivo: erroLeitura.message }

  // O servidor roda em UTC: depois das 21h, `toISOString` ja seria amanha.
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const como = comoDesmatricular(atual, hoje)
  const { error } =
    como.acao === 'excluir'
      ? await supabase.from('matriculas').delete().eq('id', id)
      : await supabase
          .from('matriculas')
          .update({ status: 'Encerrada', data_fim: como.data_fim })
          .eq('id', id)
  if (error) return { ok: false as const, motivo: error.message }

  // Decisao 11 (28/10/2026): aula ja cobrada depois da saida vira credito.
  const aviso = juntarAviso(undefined, await acertarCobrancasDaSaida(atual.aluno_id, atual.turma_id))

  after(() => atualizarAlunosNosEventos([atual.turma_id]))

  revalidatePath('/matriculas')
  revalidatePath(`/matriculas/${id}`)
  revalidatePath('/creditos')
  revalidatePath('/cobrancas', 'layout')
  return { ok: true as const, excluida: como.acao === 'excluir', aviso }
}
