import 'server-only'
import { clienteServidor } from './cliente'
import { montarListaDaAula } from './lista-da-aula'
import { quandoDaTurma, type TurmaComHorario } from '@/dominio/turmas/quando'
import { destinosDoLink, type DestinoDoLink, type RegistroDeEnvio } from '@/dominio/notificacoes/link-da-aula'
import type { CanalEnvio, ContextoNotificacao, Pessoa } from '@/dominio/notificacoes/mensagens'

/**
 * Envio do link da aula pela propria aula, na agenda (pedido de 16/10/2026).
 * A regra de quem recebe e o texto ficam em `dominio/notificacoes/link-da-aula`.
 */

type AlunoComPreferencia = {
  id: number
  nome: string
  telefone: string | null
  email: string | null
  destinatario_notificacao: 'Aluno' | 'Responsável' | 'Ambos'
  canal_notificacao: 'WhatsApp' | 'E-mail' | 'Ambos'
  responsavel: Pessoa | null
}

/** Aluno sem responsavel cadastrado: sem contato, o envio a ele e pulado. */
const SEM_RESPONSAVEL: Pessoa = { id: 0, nome: '', telefone: null, email: null }

/**
 * Os destinos do link de cada aluno da chamada (quem avisou que nao vem fica
 * de fora). `null` quando a aula nao tem link a enviar: presencial, sem sala
 * ou fora de Agendada.
 */
export async function linksDaAula(aulaId: number): Promise<Map<number, DestinoDoLink[]> | null> {
  const supabase = await clienteServidor()
  const { data: aula } = await supabase
    .from('aulas')
    .select(`
      id, turma_id, status, data_hora_inicio, data_hora_fim, data_hora_referencia, link_online,
      turma:turmas!turma_id (nome, modalidade, link_videochamada, tipo_recorrencia, data_unica, dias_semana, frequencia, intervalo, data_inicio, horario_inicio)
    `)
    .eq('id', aulaId)
    .maybeSingle()

  const turma = aula?.turma as unknown as
    | (TurmaComHorario & { modalidade: 'Presencial' | 'Online'; link_videochamada: string | null })
    | null

  if (!aula || !turma || aula.status !== 'Agendada' || turma.modalidade !== 'Online') return null
  // A sala do Meet e da turma; `link_online` so existe quando alguem trocou o
  // link desta aula em particular.
  const link = aula.link_online ?? turma.link_videochamada
  if (!link) return null

  const lista = await montarListaDaAula(supabase, aula)
  const ids = lista.chamada.map((m) => m.aluno_id)
  if (ids.length === 0) return new Map()

  const [{ data: alunos }, { data: registrados }] = await Promise.all([
    supabase
      .from('alunos')
      .select(`
        id, nome, telefone, email, destinatario_notificacao, canal_notificacao,
        responsavel:responsaveis!responsavel_id (id, nome, telefone, email)
      `)
      .in('id', ids),
    supabase
      .from('notificacoes')
      .select('destinatario_tipo, destinatario_id, canal, status, enviado_em')
      .eq('tipo', 'LinkAula')
      .eq('referencia_tipo', 'aulas')
      .eq('referencia_id', aula.id),
  ])

  const inicio = String(aula.data_hora_inicio)

  return new Map(
    ((alunos ?? []) as unknown as AlunoComPreferencia[]).map((a) => {
      const ctx: ContextoNotificacao = {
        tipo: 'LinkAula',
        aluno: { id: a.id, nome: a.nome, telefone: a.telefone, email: a.email },
        responsavel: a.responsavel ?? SEM_RESPONSAVEL,
        destinatario: a.destinatario_notificacao,
        canal: a.canal_notificacao,
        turma: {
          nome: turma.nome,
          quando: quandoDaTurma(turma),
          // O horario desta aula: a remarcada nao esta no horario da turma.
          horario_inicio: inicio.slice(11, 16),
          horario_fim: String(aula.data_hora_fim).slice(11, 16),
          modalidade: 'Online',
        },
        referencia: { tipo: 'aulas', id: aula.id },
        aula: { data_hora_inicio: inicio, link },
      }
      return [a.id, destinosDoLink(ctx, (registrados ?? []) as RegistroDeEnvio[])]
    }),
  )
}

/**
 * Registra que o link saiu para um destino. O texto e refeito aqui, e nao
 * recebido da tela: o registro guarda o que a regra manda, e um aluno fora da
 * chamada (avisou que nao vem, saiu da turma) nao ganha envio.
 *
 * Reenviar so atualiza o horario: um registro por aula, pessoa e canal, a
 * mesma chave que a fila usava para nao duplicar.
 */
export async function registrarEnvioDeLink(
  aulaId: number,
  alunoId: number,
  destinatarioTipo: 'aluno' | 'responsavel',
  canal: CanalEnvio,
): Promise<{ ok: true; enviado_em: string } | { ok: false; motivo: string }> {
  const links = await linksDaAula(aulaId)
  const destino = links
    ?.get(alunoId)
    ?.find((d) => d.destinatario_tipo === destinatarioTipo && d.canal === canal)
  if (!destino) return { ok: false, motivo: 'Este aluno não tem link a receber nesta aula.' }

  const supabase = await clienteServidor()
  const enviado_em = new Date().toISOString()

  const { data: existente } = await supabase
    .from('notificacoes')
    .select('id')
    .eq('tipo', 'LinkAula')
    .eq('referencia_tipo', 'aulas')
    .eq('referencia_id', aulaId)
    .eq('destinatario_tipo', destino.destinatario_tipo)
    .eq('destinatario_id', destino.destinatario_id)
    .eq('canal', canal)
    .limit(1)
    .maybeSingle()

  const campos = { status: 'Enviada', enviado_em, texto_gerado: destino.texto }
  const { error } = existente
    ? await supabase.from('notificacoes').update(campos).eq('id', existente.id)
    : await supabase.from('notificacoes').insert({
        ...campos,
        tipo: 'LinkAula',
        canal,
        destinatario_tipo: destino.destinatario_tipo,
        destinatario_id: destino.destinatario_id,
        referencia_tipo: 'aulas',
        referencia_id: aulaId,
      })

  if (error) return { ok: false, motivo: `Não foi possível registrar o envio: ${error.message}` }
  return { ok: true, enviado_em }
}
