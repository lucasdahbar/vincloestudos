'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { clienteServidor } from '@/dados/cliente'
import { sincronizarAulas } from '@/dados/aulas'
import { exigirGestora } from '@/dados/sessao'
import { validarTurma, type EntradaTurma } from '@/dominio/turmas/regras'
import { gerarNomeTurma } from '@/dominio/turmas/nome'
import { avisarProfessorDaTurma } from '@/dados/avisos-turma'
import { apagarEventoDaTurma, sincronizarEventoDaTurma } from '@/dados/evento-da-turma'

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
    tipo_recorrencia: entrada.tipo_recorrencia,
    data_unica: entrada.data_unica,
    dias_semana: entrada.dias_semana,
    horario_inicio: entrada.horario_inicio,
    horario_fim: entrada.horario_fim,
    status: entrada.status,
    link_videochamada: entrada.link_videochamada,
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

  // G2: o evento na agenda do professor acompanha a turma, na criacao e na
  // edicao — mudar o horario aqui tem de mudar la.
  after(async () => {
    try {
      const r = await sincronizarEventoDaTurma(resposta.data.id)
      if (!r.ok) console.warn('evento da turma nao sincronizado:', r.motivo)
    } catch (e) {
      // A turma ja esta gravada; o evento e reflexo dela. A proxima edicao refaz.
      console.error('falha ao sincronizar o evento da turma:', e)
    }
  })

  // G4: so na criacao. Reenviar a cada edicao encheria a caixa do professor de
  // avisos iguais, e o documento pede o e-mail "ao criar uma nova Turma".
  if (id === null) {
    const cabecalhos = await headers()
    const anfitriao = cabecalhos.get('host') ?? ''
    const protocolo = anfitriao.startsWith('localhost') ? 'http' : 'https'
    const urlBase = anfitriao ? `${protocolo}://${anfitriao}` : ''

    after(async () => {
      try {
        await avisarProfessorDaTurma(resposta.data.id, urlBase)
      } catch (e) {
        // O aviso e conveniencia: a turma existe mesmo que o e-mail falhe.
        console.error('falha ao avisar o professor da turma nova:', e)
      }
    })
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

  // G2: turma encerrada sai da agenda do professor; reativada, volta.
  after(async () => {
    try {
      await sincronizarEventoDaTurma(id)
    } catch (e) {
      console.error('falha ao atualizar o evento da turma:', e)
    }
  })

  revalidatePath('/turmas')
  revalidatePath(`/turmas/${id}`)
}

export interface PreviaExclusaoTurma {
  podeExcluir: boolean
  motivo: string
  matriculas: number
  aulas: number
  pagamentos: number
}

/**
 * O que acontece se esta turma for excluida — consultado ANTES de perguntar.
 *
 * As tres chaves estrangeiras que apontam para `turmas` sao `on delete
 * restrict`: matricula, aula e pagamento seguram a turma de proposito, para
 * que ninguem apague historico financeiro por engano. Sem esta previa a
 * gestora so descobriria isso no erro cru do banco.
 */
export async function consultarExclusaoTurma(id: number): Promise<PreviaExclusaoTurma> {
  await exigirGestora()
  const supabase = await clienteServidor()

  const contar = async (tabela: 'matriculas' | 'aulas' | 'itens_conta_pagar_professor') => {
    const { count } = await supabase
      .from(tabela)
      .select('id', { count: 'exact', head: true })
      .eq('turma_id', id)
    return count ?? 0
  }

  const [matriculas, aulas, pagamentos] = await Promise.all([
    contar('matriculas'),
    contar('aulas'),
    contar('itens_conta_pagar_professor'),
  ])

  if (pagamentos > 0) {
    return {
      podeExcluir: false,
      motivo:
        'Esta turma ja entrou no pagamento de um professor. Excluir apagaria historico financeiro, ' +
        'entao ela so pode ser encerrada.',
      matriculas,
      aulas,
      pagamentos,
    }
  }

  if (matriculas > 0 || aulas > 0) {
    const partes = [
      matriculas > 0 && `${matriculas} ${matriculas === 1 ? 'matricula' : 'matriculas'}`,
      aulas > 0 && `${aulas} ${aulas === 1 ? 'aula' : 'aulas'}`,
    ].filter(Boolean)

    return {
      podeExcluir: false,
      motivo:
        `Esta turma tem ${partes.join(' e ')}. Encerre a turma em vez de excluir: o evento sai da ` +
        'agenda do professor e o historico continua de pe.',
      matriculas,
      aulas,
      pagamentos,
    }
  }

  return {
    podeExcluir: true,
    motivo:
      'Esta turma nao tem matricula, aula nem pagamento. Excluir apaga o cadastro e retira o ' +
      'evento da agenda do professor. Nao tem como voltar atras.',
    matriculas,
    aulas,
    pagamentos,
  }
}

export async function excluirTurma(id: number): Promise<{ ok: boolean; erro?: string }> {
  await exigirGestora()

  const previa = await consultarExclusaoTurma(id)
  if (!previa.podeExcluir) return { ok: false, erro: previa.motivo }

  // A agenda primeiro: depois do delete nao ha mais de onde ler qual evento
  // apagar, e ele ficaria orfao na agenda do professor para sempre.
  try {
    await apagarEventoDaTurma(id)
  } catch (e) {
    console.error('falha ao retirar o evento da agenda antes de excluir:', e)
  }

  const supabase = await clienteServidor()
  const { error } = await supabase.from('turmas').delete().eq('id', id)
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/turmas')
  revalidatePath('/agenda')
  return { ok: true }
}
