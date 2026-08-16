import 'server-only'
import { clienteServidor } from './cliente'
import { nomesDosDias } from '@/dominio/tipos'
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
        id, nome, dias_semana, horario_inicio, horario_fim, modalidade
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

  // O link nao vive na turma, e sim em cada aula. Para as boas-vindas usamos o
  // da proxima aula agendada: e o endereco da sala que o aluno vai usar.
  let link: string | null = null
  if (m.turma.modalidade === 'Online') {
    const supabase = await clienteServidor()
    const { data: proxima } = await supabase
      .from('aulas')
      .select('link_online')
      .eq('turma_id', m.turma.id)
      .eq('status', 'Agendada')
      .not('link_online', 'is', null)
      .order('data_hora_inicio')
      .limit(1)
      .maybeSingle()
    link = proxima?.link_online ?? null
  }

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
      dias: nomesDosDias(m.turma.dias_semana ?? []),
      horario_inicio: String(m.turma.horario_inicio).slice(0, 5),
      horario_fim: String(m.turma.horario_fim).slice(0, 5),
      modalidade: m.turma.modalidade,
    },
    link,
    referencia: { tipo: 'matriculas', id: m.id },
  }

  return enfileirar(planejarNotificacoes(ctx))
}

/**
 * Lembretes com o link das aulas online que comecam nas proximas horas
 * (Operacionais 4.5). Chamado pelo script de rotina.
 */
export async function enfileirarLembretesDeAula(horasAFrente = 24): Promise<number> {
  const supabase = await clienteServidor()
  const agora = new Date()
  const limite = new Date(agora.getTime() + horasAFrente * 3600_000)

  const { data: aulas } = await supabase
    .from('aulas')
    .select(`
      id, data_hora_inicio, link_online, turma_id,
      turma:turmas!turma_id (id, nome, dias_semana, horario_inicio, horario_fim, modalidade)
    `)
    .eq('status', 'Agendada')
    .gte('data_hora_inicio', agora.toISOString())
    .lte('data_hora_inicio', limite.toISOString())

  const linhas = (aulas ?? []) as unknown as {
    id: number
    data_hora_inicio: string
    link_online: string | null
    turma_id: number
    turma: {
      id: number
      nome: string
      dias_semana: number[]
      horario_inicio: string
      horario_fim: string
      modalidade: 'Presencial' | 'Online'
    } | null
  }[]

  const online = linhas.filter((a) => a.turma?.modalidade === 'Online' && a.link_online)
  if (online.length === 0) return 0

  let total = 0

  for (const aula of online) {
    const dia = aula.data_hora_inicio.slice(0, 10)
    const { data: mats } = await supabase
      .from('matriculas')
      .select(`
        id, flag_reposicao, data_fim,
        aluno:alunos!aluno_id (
          id, nome, telefone, email, destinatario_notificacao, canal_notificacao,
          responsavel:responsaveis!responsavel_id (id, nome, telefone, email)
        )
      `)
      .eq('turma_id', aula.turma_id)
      .eq('status', 'Ativa')
      .lte('data_inicio', dia)

    const matriculados = ((mats ?? []) as unknown as {
      data_fim: string | null
      aluno: {
        id: number
        nome: string
        telefone: string | null
        email: string | null
        destinatario_notificacao: 'Aluno' | 'Responsável' | 'Ambos'
        canal_notificacao: 'WhatsApp' | 'E-mail' | 'Ambos'
        responsavel: { id: number; nome: string; telefone: string | null; email: string | null } | null
      } | null
    }[]).filter((m) => (!m.data_fim || m.data_fim >= dia) && m.aluno?.responsavel)

    for (const m of matriculados) {
      const a = m.aluno!
      total += await enfileirar(
        planejarNotificacoes({
          tipo: 'LinkAula',
          aluno: { id: a.id, nome: a.nome, telefone: a.telefone, email: a.email },
          responsavel: a.responsavel!,
          destinatario: a.destinatario_notificacao,
          canal: a.canal_notificacao,
          turma: {
            nome: aula.turma!.nome,
            dias: nomesDosDias(aula.turma!.dias_semana ?? []),
            horario_inicio: String(aula.turma!.horario_inicio).slice(0, 5),
            horario_fim: String(aula.turma!.horario_fim).slice(0, 5),
            modalidade: 'Online',
          },
          link: null,
          referencia: { tipo: 'aulas', id: aula.id },
          aula: { data_hora_inicio: aula.data_hora_inicio, link: aula.link_online },
        }),
      )
    }
  }

  return total
}

export async function listarPendentes(): Promise<NotificacaoPendente[]> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('notificacoes')
    .select('id, tipo, canal, destinatario_tipo, destinatario_id, agendado_para, texto_gerado, status')
    .in('status', ['Pendente', 'Pronta'])
    .order('agendado_para', { ascending: true, nullsFirst: true })
    .limit(100)

  const linhas = data ?? []
  if (linhas.length === 0) return []

  const alunos = linhas.filter((l) => l.destinatario_tipo === 'aluno').map((l) => l.destinatario_id)
  const resps = linhas.filter((l) => l.destinatario_tipo === 'responsavel').map((l) => l.destinatario_id)

  const [{ data: da }, { data: dr }] = await Promise.all([
    alunos.length
      ? supabase.from('alunos').select('id, nome, telefone, email').in('id', alunos)
      : Promise.resolve({ data: [] }),
    resps.length
      ? supabase.from('responsaveis').select('id, nome, telefone, email').in('id', resps)
      : Promise.resolve({ data: [] }),
  ])

  const porTipo = {
    aluno: new Map((da ?? []).map((p) => [p.id, p])),
    responsavel: new Map((dr ?? []).map((p) => [p.id, p])),
  }

  return linhas.map((l) => {
    const p = porTipo[l.destinatario_tipo as 'aluno' | 'responsavel']?.get(l.destinatario_id)
    return {
      ...l,
      destinatario_nome: p?.nome ?? 'Contato removido',
      contato: l.canal === 'WhatsApp' ? (p?.telefone ?? null) : (p?.email ?? null),
    }
  })
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
