import 'server-only'
import { clienteServidor } from './cliente'
import { quandoDaTurma } from '@/dominio/turmas/quando'
import {
  identificarDestinatario,
  TABELA_DO_DESTINATARIO,
  type Contato,
  type PessoasPorTipo,
  type TipoDestinatario,
} from '@/dominio/notificacoes/destinatarios'
import {
  planejarNotificacoes,
  type ContextoNotificacao,
  type NotificacaoAEnfileirar,
} from '@/dominio/notificacoes/mensagens'

export interface NotificacaoPendente {
  id: number
  tipo: string
  canal: string
  destinatario_tipo: string
  destinatario_id: number
  destinatario_nome: string
  contato: string | null
  agendado_para: string | null
  texto_gerado: string
  status: string
}

/**
 * Grava as mensagens, ignorando as que ja existem para a mesma referencia.
 *
 * A chave (tipo, referencia, destinatario, canal) impede duplicar: matricular
 * de novo, ou reprocessar as aulas do dia, nao pode encher a fila da gestora
 * com a mesma mensagem repetida.
 */
async function enfileirar(linhas: NotificacaoAEnfileirar[]): Promise<number> {
  if (linhas.length === 0) return 0
  const supabase = await clienteServidor()

  const { data: existentes } = await supabase
    .from('notificacoes')
    .select('tipo, referencia_tipo, referencia_id, destinatario_tipo, destinatario_id, canal')
    .in('referencia_id', [...new Set(linhas.map((l) => l.referencia_id))])

  const jaTem = new Set(
    (existentes ?? []).map(
      (e) =>
        `${e.tipo}|${e.referencia_tipo}|${e.referencia_id}|${e.destinatario_tipo}|${e.destinatario_id}|${e.canal}`,
    ),
  )

  const novas = linhas.filter(
    (l) =>
      !jaTem.has(
        `${l.tipo}|${l.referencia_tipo}|${l.referencia_id}|${l.destinatario_tipo}|${l.destinatario_id}|${l.canal}`,
      ),
  )

  if (novas.length === 0) return 0

  const { error } = await supabase
    .from('notificacoes')
    .insert(novas.map((n) => ({ ...n, status: 'Pronta' })))

  if (error) throw new Error(`Falha ao enfileirar notificação: ${error.message}`)
  return novas.length
}

/** Dados do aluno, responsavel e turma necessarios para montar a mensagem. */
async function contextoDaMatricula(matriculaId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('matriculas')
    .select(`
      id, flag_reposicao,
      aluno:alunos!aluno_id (
        id, nome, telefone, email, destinatario_notificacao, canal_notificacao,
        responsavel:responsaveis!responsavel_id (id, nome, telefone, email)
      ),
      turma:turmas!turma_id (
        id, nome, tipo_recorrencia, data_unica, dias_semana, frequencia, intervalo, data_inicio, horario_inicio, horario_fim, modalidade
      )
    `)
    .eq('id', matriculaId)
    .maybeSingle()

  return data as unknown as {
    id: number
    flag_reposicao: boolean
    aluno: {
      id: number
      nome: string
      telefone: string | null
      email: string | null
      destinatario_notificacao: 'Aluno' | 'Responsável' | 'Ambos'
      canal_notificacao: 'WhatsApp' | 'E-mail' | 'Ambos'
      responsavel: { id: number; nome: string; telefone: string | null; email: string | null } | null
    } | null
    turma: {
      id: number
      nome: string
      tipo_recorrencia: 'Recorrente' | 'Único'
      data_unica: string | null
      dias_semana: number[]
      horario_inicio: string
      horario_fim: string
      modalidade: 'Presencial' | 'Online'
    } | null
  } | null
}

/**
 * Boas-vindas ao matricular (Operacionais 4.5).
 *
 * Matricula de reposicao nao gera: e um vinculo pontual, so para o aluno poder
 * repor uma aula — dar boas-vindas confundiria.
 */
export async function enfileirarBoasVindas(matriculaId: number): Promise<number> {
  const m = await contextoDaMatricula(matriculaId)
  if (!m?.aluno?.responsavel || !m.turma || m.flag_reposicao) return 0

  // Sem o link da sala (16/10/2026): ele sai por aula, pela agenda.
  const ctx: ContextoNotificacao = {
    tipo: 'BoasVindas',
    aluno: {
      id: m.aluno.id,
      nome: m.aluno.nome,
      telefone: m.aluno.telefone,
      email: m.aluno.email,
    },
    responsavel: m.aluno.responsavel,
    destinatario: m.aluno.destinatario_notificacao,
    canal: m.aluno.canal_notificacao,
    turma: {
      nome: m.turma.nome,
      quando: quandoDaTurma(m.turma),
      horario_inicio: String(m.turma.horario_inicio).slice(0, 5),
      horario_fim: String(m.turma.horario_fim).slice(0, 5),
      modalidade: m.turma.modalidade,
    },
    referencia: { tipo: 'matriculas', id: m.id },
  }

  return enfileirar(planejarNotificacoes(ctx))
}

export async function listarPendentes(): Promise<NotificacaoPendente[]> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('notificacoes')
    .select('id, tipo, canal, destinatario_tipo, destinatario_id, agendado_para, texto_gerado, status, referencia_tipo, referencia_id')
    .in('status', ['Pendente', 'Pronta'])
    // O link da aula sai pela propria aula, na agenda (16/10/2026).
    .neq('tipo', 'LinkAula')
    .order('id')

  const todas = data ?? []
  if (todas.length === 0) return []

  // Boas-vindas de matricula apagada ou encerrada nao tem mais para quem ir: a
  // fila nao se limpava sozinha, e elas ficavam ali para sempre.
  const matriculaIds = todas
    .filter((l) => l.tipo === 'BoasVindas' && l.referencia_tipo === 'matriculas')
    .map((l) => l.referencia_id as number)
  const { data: ativas } = matriculaIds.length
    ? await supabase.from('matriculas').select('id').in('id', matriculaIds).eq('status', 'Ativa')
    : { data: [] }
  const valem = new Set((ativas ?? []).map((m) => m.id as number))
  const linhas = todas.filter(
    (l) => l.tipo !== 'BoasVindas' || l.referencia_tipo !== 'matriculas' || valem.has(l.referencia_id as number),
  )
  if (linhas.length === 0) return []

  // Uma consulta por tipo de destinatário, todas em paralelo. Percorre o mapa
  // completo de tipos: foi uma lista escrita à mão, só com aluno e responsável,
  // que fazia todo aviso de professor aparecer como "Contato removido".
  const tipos = Object.keys(TABELA_DO_DESTINATARIO) as TipoDestinatario[]
  const encontrados = await Promise.all(
    tipos.map(async (tipo) => {
      const ids = linhas.filter((l) => l.destinatario_tipo === tipo).map((l) => l.destinatario_id)
      if (ids.length === 0) return [tipo, []] as const
      const { data: achados } = await supabase
        .from(TABELA_DO_DESTINATARIO[tipo])
        .select('id, nome, telefone, email')
        .in('id', ids)
      return [tipo, (achados ?? []) as Contato[]] as const
    }),
  )

  const pessoas = Object.fromEntries(
    encontrados.map(([tipo, lista]) => [tipo, new Map(lista.map((p) => [p.id, p]))]),
  ) as PessoasPorTipo

  return linhas.map((l) => ({ ...l, ...identificarDestinatario(l, pessoas) }))
}

export async function marcarEnviada(id: number): Promise<void> {
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('notificacoes')
    .update({ status: 'Enviada', enviado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export interface AvisoSemContato {
  aluno_id: number
  aluno_nome: string
  motivo: string
}

/**
 * Alunos cuja preferencia de aviso nao tem como ser cumprida.
 *
 * Sem isto o sistema falha em silencio: a gestora marca "avisar o aluno por
 * WhatsApp", o aluno nao tem telefone, e nenhuma mensagem aparece na fila sem
 * nenhuma explicacao.
 */
export async function alunosSemContato(): Promise<AvisoSemContato[]> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('alunos')
    .select(`
      id, nome, telefone, email, destinatario_notificacao, canal_notificacao,
      responsavel:responsaveis!responsavel_id (nome, telefone, email)
    `)
    .eq('ativo', true)

  const linhas = (data ?? []) as unknown as {
    id: number
    nome: string
    telefone: string | null
    email: string | null
    destinatario_notificacao: 'Aluno' | 'Responsável' | 'Ambos'
    canal_notificacao: 'WhatsApp' | 'E-mail' | 'Ambos'
    responsavel: { nome: string; telefone: string | null; email: string | null } | null
  }[]

  const avisos: AvisoSemContato[] = []

  for (const a of linhas) {
    const canais = a.canal_notificacao === 'Ambos' ? ['WhatsApp', 'E-mail'] : [a.canal_notificacao]
    const pessoas: { rotulo: string; tel: string | null; mail: string | null }[] = []
    if (a.destinatario_notificacao !== 'Responsável') {
      pessoas.push({ rotulo: 'o aluno', tel: a.telefone, mail: a.email })
    }
    if (a.destinatario_notificacao !== 'Aluno' && a.responsavel) {
      pessoas.push({
        rotulo: `o responsável (${a.responsavel.nome})`,
        tel: a.responsavel.telefone,
        mail: a.responsavel.email,
      })
    }

    const faltando = pessoas.flatMap((p) =>
      canais
        .filter((c) => (c === 'WhatsApp' ? !p.tel : !p.mail))
        .map((c) => `${p.rotulo} não tem ${c === 'WhatsApp' ? 'telefone' : 'e-mail'}`),
    )

    if (faltando.length > 0 && faltando.length === pessoas.length * canais.length) {
      avisos.push({ aluno_id: a.id, aluno_nome: a.nome, motivo: faltando.join(' e ') })
    }
  }

  return avisos
}
