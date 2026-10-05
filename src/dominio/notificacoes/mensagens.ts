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
    /** "Terças e quintas, às 15:00" (ver `quandoDaTurma`). */
    quando: string
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

/** Mesmo estilo do lembrete de link, a pedido da escola. */
function textoBoasVindas(ctx: ContextoNotificacao, paraAluno: boolean): string {
  const link =
    ctx.turma.modalidade === 'Online' && ctx.link ? [`Link da sala: ${ctx.link}`] : []

  if (paraAluno) {
    return [
      `Oi, ${primeiroNome(ctx.aluno.nome)}! Tudo bem? Boas-vindas à turma de ${ctx.turma.nome}.`,
      '',
      `${ctx.turma.quando}.`,
      ...link,
      '',
      'Boas aulas para você! Um abraço!',
    ].join('\n')
  }

  return [
    `Oi, ${primeiroNome(ctx.responsavel.nome)}! Tudo bem? A matrícula de ${primeiroNome(ctx.aluno.nome)} na turma abaixo está confirmada.`,
    '',
    ctx.turma.nome,
    `${ctx.turma.quando}.`,
    ...link,
    '',
    'Qualquer dúvida, só chamar! Um abraço!',
  ].join('\n')
}

const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * "Terça-feira, 4 de agosto, às 15:00."
 *
 * Lido direto do texto, sem `Date` no fuso de Brasília: a aula é gravada com o
 * horário de parede como se fosse UTC (ver `agoraNaEscola`). Converter fuso
 * aqui deslocaria a hora em três e, de madrugada, mudaria o dia.
 */
function quandoDaAula(dataHoraInicio: string): string {
  const [ano, mes, dia] = dataHoraInicio.slice(0, 10).split('-').map(Number)
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  return `${DIAS_DA_SEMANA[semana]}, ${dia} de ${MESES[mes - 1]}, às ${dataHoraInicio.slice(11, 16)}.`
}

function textoLinkAula(ctx: ContextoNotificacao, paraAluno: boolean): string {
  const quando = quandoDaAula(ctx.aula!.data_hora_inicio)
  const link = `Link da sala: ${ctx.aula!.link}`

  if (paraAluno) {
    return [
      `Oi, ${primeiroNome(ctx.aluno.nome)}! Tudo bem? Segue o link para a aula de ${ctx.turma.nome}.`,
      '',
      quando,
      link,
      '',
      'Boa aula para você! Um abraço!',
    ].join('\n')
  }

  return [
    `Oi, ${primeiroNome(ctx.responsavel.nome)}! Tudo bem? Segue o link para a aula de ${primeiroNome(ctx.aluno.nome)}.`,
    '',
    ctx.turma.nome,
    quando,
    link,
    '',
    'Qualquer dúvida, só chamar! Um abraço!',
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
