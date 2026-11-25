import { somarDias } from '@/dominio/agenda/recorrencia'
import type { StatusAula, TipoRecorrencia } from '@/dominio/tipos'

/**
 * Encerrar turma (pedido do tio, 13/10/2026; spec 2026-10-13-encerrar-turma).
 *
 * A data de encerramento e o primeiro dia SEM aula: a turma termina na
 * vespera. Esta funcao so decide se pode e o que vai acontecer; quem aplica e
 * a funcao `encerrar_turma` no banco, que confere os bloqueios de novo.
 */
export interface SituacaoEncerramento {
  tipo_recorrencia: TipoRecorrencia
  /** Recorrente: primeiro dia da turma. */
  data_inicio: string | null
  /** Recorrente: último dia da turma hoje. */
  data_fim: string | null
  /** Aula unica: a data dela. */
  data_unica: string | null
  aulas: { data: string; status: StatusAula; temPresenca: boolean }[]
  matriculasAtivas: number
  /** Alunos de outras turmas com reposicao Agendada numa aula desta. */
  reposicoesChegando: { aluno: string; data: string }[]
  /** Itens de cobranca das aulas desta turma (cobranca nao cancelada). */
  cobrancas: {
    aluno: string
    data: string
    confirmada: boolean
    temReposicao: boolean
    /**
     * O aluno nao tem mais matricula na turma nessa data. A saida ja acertou a
     * aula (credito ou tirou da cobranca, opcao A de 13/11/2026), mas o item
     * pode seguir na cobranca, e o credito nao aponta para ele (caso Eric, 16/11/2026).
     */
    alunoSaiu?: boolean
  }[]
}

export type AvaliacaoEncerramento =
  | { pode: true; vespera: string; alunos: number; aulasQueSaem: number; itensDeRascunho: number }
  | {
      pode: false
      motivos: string[]
      /** So falta escolher o destino de cada aluno: o encerramento com acerto resolve. */
      acertoNaPrevia: boolean
    }

const ddmmaaaa = (iso: string) => iso.split('-').reverse().join('/')

const aconteceu = (a: SituacaoEncerramento['aulas'][number]) =>
  a.status === 'Realizada' || a.temPresenca

/**
 * Aula unica nao pergunta data: se a aula ainda nao aconteceu, ela sai; se
 * ja aconteceu, nada sai e a turma so muda de status.
 */
export function dataDoEncerramento(s: SituacaoEncerramento, informada: string | null): string | null {
  if (s.tipo_recorrencia === 'Único') {
    if (!s.data_unica) return null
    return s.aulas.some(aconteceu) ? somarDias(s.data_unica, 1) : s.data_unica
  }
  return informada
}

export function avaliarEncerramento(
  s: SituacaoEncerramento,
  data: string,
  /**
   * Etapa 6c: pela previa de mudanca, quem vem repor volta para as pendentes
   * e cada aluno cobrado ja escolheu reposicao ou credito antes do
   * encerramento. Essas duas travas sao resolvidas la, nao aqui.
   */
  opcoes: { resolvidoNaPrevia?: boolean } = {},
): AvaliacaoEncerramento {
  const motivos: string[] = []
  const depois = <T extends { data: string }>(xs: T[]) => xs.filter((x) => x.data >= data)

  // Aula dada nao "desacontece": a primeira data possivel e o dia seguinte a
  // ultima aula dada.
  const dadas = depois(s.aulas.filter(aconteceu)).map((a) => a.data).sort()
  if (dadas.length > 0) {
    const ultima = dadas[dadas.length - 1]
    motivos.push(
      `A aula de ${ddmmaaaa(ultima)} já aconteceu (tem presença registrada). ` +
        `A primeira data possível para encerrar é ${ddmmaaaa(somarDias(ultima, 1))}.`,
    )
  }

  if (s.tipo_recorrencia === 'Recorrente' && s.data_inicio && data <= s.data_inicio) {
    motivos.push(
      `A turma começa em ${ddmmaaaa(s.data_inicio)}: encerrar nessa data a deixaria sem aula ` +
        'nenhuma. Nesse caso, use Excluir turma (desmatricule os alunos antes, se houver).',
    )
  }

  // Uma data alem do fim atual estenderia a turma em vez de encerra-la (ano
  // digitado errado, ou o fim marcado para o futuro que ja passou). O dia
  // seguinte ao fim atual vale: e o que encerra a turma que ja terminou.
  if (s.tipo_recorrencia === 'Recorrente' && s.data_fim && data > somarDias(s.data_fim, 1)) {
    motivos.push(
      `A turma já termina em ${ddmmaaaa(s.data_fim)}. Para encerrar, escolha uma data até ` +
        `${ddmmaaaa(somarDias(s.data_fim, 1))}.`,
    )
  }

  // Ate aqui, travas de data. As de baixo (reposicao chegando, aula cobrada)
  // o encerramento com acerto dos alunos resolve (/turmas/[id]/encerrar).
  const travasDeData = motivos.length

  for (const r of opcoes.resolvidoNaPrevia ? [] : depois(s.reposicoesChegando)) {
    motivos.push(`${r.aluno} tem reposição marcada em ${ddmmaaaa(r.data)}: remarque antes.`)
  }

  // Cobranca confirmada nao se mexe: o aluno vai para reposicao (a aula segue
  // cobrada e a reposicao sai a R$ 0,00 — Rodada 3).
  const semReposicao = opcoes.resolvidoNaPrevia
    ? []
    : depois(s.cobrancas).filter((c) => c.confirmada && !c.temReposicao && !c.alunoSaiu)
  if (semReposicao.length > 0) {
    const quem = semReposicao.map((c) => `${c.aluno} em ${ddmmaaaa(c.data)}`).join(', ')
    // 25/11/2026: o "Editar aulas" nao encerra mais; o modal oferece o botao
    // do encerramento com acerto logo abaixo desta mensagem.
    motivos.push(
      `Já há cobrança confirmada de aulas a partir dessa data: ${quem}. Para essas aulas, ` +
        'é preciso escolher o que fazer com cada aluno: reposição ou crédito (se ainda não ' +
        'foi paga, a aula só sai da cobrança).',
    )
  }

  if (motivos.length > 0) {
    const acertoNaPrevia = travasDeData === 0 && s.tipo_recorrencia === 'Recorrente'
    return { pode: false, motivos, acertoNaPrevia }
  }

  return {
    pode: true,
    vespera: somarDias(data, -1),
    alunos: s.matriculasAtivas,
    aulasQueSaem: depois(s.aulas.filter((a) => a.status !== 'Excluída')).length,
    itensDeRascunho: depois(s.cobrancas).filter((c) => !c.confirmada).length,
  }
}
