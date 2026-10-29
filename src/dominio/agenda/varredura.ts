import type { StatusCobranca } from '@/dominio/reposicoes/desfecho'
import type { SituacaoDaAula, SituacaoPrincipal } from './situacao'

/**
 * Etapa 6 de "turmas como agenda" (29/10/2026): a varredura.
 *
 * Editar, excluir e encerrar seguem os mesmos passos: percorrer cada aula do
 * escopo, aluno por aluno, e separar em tres grupos — muda sozinha, precisa
 * de uma escolha, nao pode mudar (com o motivo). Nada e gravado aqui: a
 * gestora ve a previa, responde o que falta e so entao a mudanca e aplicada.
 *
 * Encerrar e excluir "a partir de uma data": usa a acao `excluir` com as
 * aulas a partir dela.
 */

export type Escopo = 'esta' | 'a-partir' | 'serie'

export type Acao =
  | { tipo: 'editar'; quando?: boolean; professor?: boolean; servico?: boolean }
  | { tipo: 'excluir' }

export interface AlunoDaVarredura {
  aluno_id: number
  nome: string
  /** `turma`: matricula desta turma (ou avulso). `reposicao`: veio de outra repor aqui. */
  vinculo: 'turma' | 'reposicao'
  /** Avisou que nao vem: ja tem a sua reposicao. */
  avisou: boolean
  /** Status da cobranca do item deste aluno nesta aula, sem as canceladas. */
  cobranca: StatusCobranca | null
}

export interface AulaDaVarredura {
  id: number
  /** Data de referencia (a original, se a aula foi remarcada). */
  data: string
  /** AAAA-MM-DDTHH:MM no relogio da escola. */
  inicio: string
  situacao: SituacaoDaAula
  alunos: AlunoDaVarredura[]
  /** Editar dia ou horario: a data nova da aula, para o aviso da decisao 6. */
  novaData?: string
}

export type Desfecho = 'reposicao' | 'sem-reposicao' | 'credito'

export interface Respostas {
  /** Decisao 5: a aula que passou sem chamada aconteceu? Por id da aula. */
  aconteceu?: Record<number, boolean>
  /** Excluir: o que fazer com cada aluno, pela chave `aula:aluno`. */
  alunos?: Record<string, Desfecho>
}

export interface AlunoComEscolha {
  aluno_id: number
  nome: string
  opcoes: Desfecho[]
  escolhido: Desfecho | null
}

export interface AulaVarrida {
  id: number
  data: string
  inicio: string
  situacao: SituacaoPrincipal
  grupo: 'muda' | 'escolha' | 'fica'
  /** So no grupo `fica`. */
  motivo?: string
  /** A pergunta da decisao 5, enquanto nao respondida. */
  pergunta?: 'aconteceu'
  /** Excluir: alunos que pedem escolha da gestora. */
  alunos: AlunoComEscolha[]
  /** O que a gestora precisa saber, mesmo quando a aula muda. */
  avisos: string[]
  /** Excluir: a aula some de vez ou fica como Excluida, segurando o que aponta para ela. */
  destino?: 'apagada' | 'excluida'
  /** Editar: o que de fato muda nesta aula. */
  campos?: { quando?: boolean; professor?: boolean; servico?: boolean }
}

export interface Varredura {
  aulas: AulaVarrida[]
  mudam: number
  escolhas: number
  ficam: number
  /** Decisao 13: alunos de outras turmas que repoem numa aula que muda ou sai. */
  avisar: { nome: string; data: string }[]
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const mes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1]

// Rascunho nao foi para o responsavel: nao conta como cobrado.
const cobrado = (a: AlunoDaVarredura) => a.cobranca !== null && a.cobranca !== 'Rascunho' && a.cobranca !== 'Cancelada'

const FORA_DA_AGENDA: SituacaoPrincipal[] = ['Excluída', 'Cancelada', 'Feriado']
const JA_ACONTECEU = 'Esta aula já aconteceu: a chamada foi feita.'

export function varrer(
  aulas: AulaDaVarredura[],
  acao: Acao,
  escopo: Escopo,
  respostas: Respostas = {},
): Varredura {
  const avisar: Varredura['avisar'] = []
  const varridas = aulas
    .filter((a) => !FORA_DA_AGENDA.includes(a.situacao.principal))
    .map((a) => (acao.tipo === 'excluir' ? excluir(a, respostas, avisar) : editar(a, acao, escopo, respostas, avisar)))

  return {
    aulas: varridas,
    mudam: varridas.filter((a) => a.grupo === 'muda').length,
    escolhas: varridas.filter((a) => a.grupo === 'escolha').length,
    ficam: varridas.filter((a) => a.grupo === 'fica').length,
    avisar,
  }
}

function base(a: AulaDaVarredura): Omit<AulaVarrida, 'grupo'> {
  return { id: a.id, data: a.data, inicio: a.inicio, situacao: a.situacao.principal, alunos: [], avisos: [] }
}

/**
 * Decisao 5: aula que passou sem chamada pode ter acontecido (o professor
 * esqueceu). `null` = pode seguir como se nao tivesse acontecido.
 */
function perguntar(a: AulaDaVarredura, respostas: Respostas, seAconteceu: string): AulaVarrida | null {
  if (a.situacao.principal !== 'Aguardando chamada') return null
  const resposta = respostas.aconteceu?.[a.id]
  if (resposta === undefined) return { ...base(a), grupo: 'escolha', pergunta: 'aconteceu' }
  if (resposta) return { ...base(a), grupo: 'fica', motivo: seAconteceu }
  return null
}

function editar(
  a: AulaDaVarredura,
  acao: Extract<Acao, { tipo: 'editar' }>,
  escopo: Escopo,
  respostas: Respostas,
  avisar: Varredura['avisar'],
): AulaVarrida {
  const realizada = a.situacao.principal === 'Realizada' || a.situacao.principal === 'Concluída'

  // So dia/horario e professor dependem de a aula ter acontecido; o servico
  // segue a cobranca (decisao 8).
  if (acao.quando || acao.professor) {
    const r = perguntar(a, respostas, 'A aula aconteceu: faça a chamada, ou exclua a aula, antes de mudá-la.')
    if (r) return r
  }

  const motivos: string[] = []
  const campos: NonNullable<AulaVarrida['campos']> = {}
  const avisos: string[] = []

  if (acao.quando) {
    campos.quando = !realizada
    if (realizada) motivos.push(JA_ACONTECEU)
    else {
      const repondo = a.alunos.filter((x) => x.vinculo === 'reposicao')
      for (const x of repondo) avisar.push({ nome: x.nome, data: a.data })
      if (a.novaData && a.novaData.slice(0, 7) !== a.data.slice(0, 7) && a.alunos.some(cobrado)) {
        // Decisao 6: a cobranca nao se mexe; o rascunho do mes novo mostra a R$ 0,00.
        avisos.push(
          `A aula continua cobrada em ${mes(a.data)} e aparece a R$ 0,00 na cobrança de ${mes(a.novaData)}.`,
        )
      }
    }
  }

  if (acao.professor) {
    // Decisao 7: aula dada so se corrige uma a uma, e antes de entrar num pagamento.
    const podeCorrigir = escopo === 'esta' && a.situacao.pagamento === null
    campos.professor = !realizada || podeCorrigir
    if (!campos.professor) {
      motivos.push(
        a.situacao.pagamento !== null
          ? 'A aula já está no pagamento do professor.'
          : `${JA_ACONTECEU} O professor de uma aula dada só se corrige em "só esta aula".`,
      )
    }
  }

  if (acao.servico) {
    // Decisao 8: vale o que foi cobrado. Rascunho e refeito na proxima geracao.
    const jaCobrada = a.alunos.some(cobrado)
    campos.servico = !jaCobrada && a.situacao.pagamento === null
    if (!campos.servico) {
      motivos.push(
        jaCobrada
          ? 'O serviço fica: a aula já foi cobrada. Para mudar o preço, cancele a cobrança e gere de novo, ou dê desconto.'
          : 'O serviço fica: a aula já está no pagamento do professor.',
      )
    }
  }

  const algum = Object.values(campos).some(Boolean)
  if (!algum) return { ...base(a), grupo: 'fica', motivo: motivos[0], campos }
  return { ...base(a), grupo: 'muda', campos, avisos: [...avisos, ...motivos] }
}

const NOME_DO_CAMPO = { quando: 'o dia ou o horário', professor: 'o professor', servico: 'o serviço' } as const

/**
 * Etapa 6b: o que impede aplicar a edicao de uma aula. Tudo ou nada: se um
 * dos campos pedidos nao pode mudar, nenhum muda.
 */
export function errosDaEdicao(
  aula: AulaVarrida | undefined,
  pedido: { quando?: boolean; professor?: boolean; servico?: boolean },
): string[] {
  if (!aula) return ['Esta aula não está mais na agenda.']
  if (aula.pergunta === 'aconteceu') return ['Responda se a aula aconteceu antes de mudá-la.']
  if (aula.grupo === 'fica') return [aula.motivo ?? 'Esta aula não pode mudar.']

  const presos = (Object.keys(NOME_DO_CAMPO) as (keyof typeof NOME_DO_CAMPO)[]).filter(
    (c) => pedido[c] && !aula.campos?.[c],
  )
  if (presos.length === 0) return []
  return [
    `Nesta aula não dá para mudar ${presos.map((c) => NOME_DO_CAMPO[c]).join(' nem ')}. ${aula.avisos.join(' ')}`.trim(),
  ]
}

function excluir(a: AulaDaVarredura, respostas: Respostas, avisar: Varredura['avisar']): AulaVarrida {
  if (a.situacao.principal === 'Realizada' || a.situacao.principal === 'Concluída') {
    return { ...base(a), grupo: 'fica', motivo: `${JA_ACONTECEU} Ela não pode sair da agenda.` }
  }
  const r = perguntar(a, respostas, 'A aula aconteceu: faça a chamada em vez de tirá-la da agenda.')
  if (r) return r

  const avisos: string[] = []
  const alunos: AlunoComEscolha[] = []
  // A aula fica como Excluida se algo aponta para ela: o aviso, a reposicao
  // de quem vinha repor, a cobranca ou a reposicao nova de alguem.
  let segura = false

  for (const x of a.alunos) {
    if (x.vinculo === 'reposicao') {
      avisos.push(`${x.nome} volta para as reposições pendentes.`)
      avisar.push({ nome: x.nome, data: a.data })
      segura = true
    } else if (x.avisou) {
      // Ja tem a reposicao dela: nao ganha outra.
      segura = true
    } else {
      const opcoes: Desfecho[] = cobrado(x) ? ['reposicao', 'credito'] : ['reposicao', 'sem-reposicao']
      const resposta = respostas.alunos?.[`${a.id}:${x.aluno_id}`]
      const escolhido = resposta && opcoes.includes(resposta) ? resposta : null
      if (cobrado(x) || escolhido === 'reposicao') segura = true
      alunos.push({ aluno_id: x.aluno_id, nome: x.nome, opcoes, escolhido })
    }
  }

  const falta = alunos.some((x) => x.escolhido === null)
  return {
    ...base(a),
    grupo: falta ? 'escolha' : 'muda',
    alunos,
    avisos,
    destino: segura ? 'excluida' : 'apagada',
  }
}
