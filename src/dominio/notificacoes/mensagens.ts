export type TipoNotificacao = 'BoasVindas' | 'LinkAula' | 'Cobranca'
export type CanalEnvio = 'WhatsApp' | 'E-mail'

export interface Pessoa {
  id: number
  nome: string
  telefone: string | null
  email: string | null
}

export interface ContextoNotificacao {
  tipo: TipoNotificacao
  aluno: Pessoa
  responsavel: Pessoa
  destinatario: 'Aluno' | 'Responsável' | 'Ambos'
  canal: 'WhatsApp' | 'E-mail' | 'Ambos'
  turma: {
    nome: string
    dias: string
    horario_inicio: string
    horario_fim: string
    modalidade: 'Presencial' | 'Online'
  }
  /** Link fixo da turma, quando houver. */
  link: string | null
  referencia: { tipo: string; id: number }
  /** Presente apenas no lembrete de aula. */
  aula?: { data_hora_inicio: string; link: string | null }
}

export interface NotificacaoAEnfileirar {
  tipo: TipoNotificacao
  canal: CanalEnvio
  destinatario_tipo: 'aluno' | 'responsavel'
  destinatario_id: number
  agendado_para: string | null
  texto_gerado: string
  referencia_tipo: string
  referencia_id: number
}

/** Minutos de antecedencia do lembrete (Operacionais 4.5). */
const ANTECEDENCIA_MIN = 30

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0]

/**
 * Garante fuso na data antes de interpretar.
 *
 * O Postgres devolve `2026-08-17T18:00:00+00:00`, ja com fuso; um timestamp
 * montado a mao pode vir sem. Acrescentar "Z" as cegas produzia
 * `...+00:00Z` — data invalida, e a fila de notificacoes quebrava inteira.
 */
function comFuso(iso: string): string {
  return /[+-]\d{2}:?\d{2}$|Z$/.test(iso) ? iso : `${iso}Z`
}

function temContato(p: Pessoa, canal: CanalEnvio): boolean {
  return canal === 'WhatsApp' ? Boolean(p.telefone) : Boolean(p.email)
}

function textoBoasVindas(ctx: ContextoNotificacao, paraAluno: boolean): string {
  const quem = paraAluno ? ctx.aluno : ctx.responsavel
  const sujeito = paraAluno ? 'Você foi matriculado' : `${primeiroNome(ctx.aluno.nome)} foi matriculado`

  const linhas = [
    `Olá, ${primeiroNome(quem.nome)}! ${sujeito} em ${ctx.turma.nome}.`,
    '',
    `Dias: ${ctx.turma.dias}`,
    `Horário: ${ctx.turma.horario_inicio} às ${ctx.turma.horario_fim}`,
  ]

  if (ctx.turma.modalidade === 'Online' && ctx.link) {
    linhas.push('', `Link da sala: ${ctx.link}`)
  }

  linhas.push('', 'Qualquer dúvida, é só chamar!')
  return linhas.join('\n')
}

function textoLinkAula(ctx: ContextoNotificacao, paraAluno: boolean): string {
  const quem = paraAluno ? ctx.aluno : ctx.responsavel
  const hora = ctx.aula!.data_hora_inicio.slice(11, 16)
  const deQuem = paraAluno ? 'Sua aula' : `A aula de ${primeiroNome(ctx.aluno.nome)}`

  return [
    `Olá, ${primeiroNome(quem.nome)}! ${deQuem} de ${ctx.turma.nome} começa às ${hora}.`,
    '',
    `Link da sala: ${ctx.aula!.link}`,
    '',
    'Até já!',
  ].join('\n')
}

/**
 * Modulos Operacionais 4.5. Monta as mensagens a enfileirar a partir das
 * preferencias cadastradas no aluno (destinatario_notificacao e
 * canal_notificacao).
 *
 * "Ambos" multiplica: destinatario Ambos com canal Ambos gera quatro mensagens,
 * uma por combinacao. Quem nao tem contato no canal escolhido e simplesmente
 * pulado — enfileirar uma mensagem sem para onde mandar so geraria trabalho
 * manual para a gestora descobrir que nao da.
 */
export function planejarNotificacoes(ctx: ContextoNotificacao): NotificacaoAEnfileirar[] {
  // Lembrete de link so existe para aula online com link.
  if (ctx.tipo === 'LinkAula' && (ctx.turma.modalidade !== 'Online' || !ctx.aula?.link)) {
    return []
  }

  const paraQuem: boolean[] =
    ctx.destinatario === 'Ambos' ? [true, false] : [ctx.destinatario === 'Aluno']
  const canais: CanalEnvio[] = ctx.canal === 'Ambos' ? ['WhatsApp', 'E-mail'] : [ctx.canal]

  const agendado =
    ctx.tipo === 'LinkAula' && ctx.aula
      ? new Date(
          new Date(comFuso(ctx.aula.data_hora_inicio)).getTime() - ANTECEDENCIA_MIN * 60_000,
        ).toISOString()
      : null

  const saida: NotificacaoAEnfileirar[] = []

  for (const paraAluno of paraQuem) {
    const pessoa = paraAluno ? ctx.aluno : ctx.responsavel
    for (const canal of canais) {
      if (!temContato(pessoa, canal)) continue

      saida.push({
        tipo: ctx.tipo,
        canal,
        destinatario_tipo: paraAluno ? 'aluno' : 'responsavel',
        destinatario_id: pessoa.id,
        agendado_para: agendado,
        texto_gerado:
          ctx.tipo === 'LinkAula' ? textoLinkAula(ctx, paraAluno) : textoBoasVindas(ctx, paraAluno),
        referencia_tipo: ctx.referencia.tipo,
        referencia_id: ctx.referencia.id,
      })
    }
  }

  return saida
}
