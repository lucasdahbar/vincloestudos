/**
 * G3 (Rodada 2): a sala do Google Meet de cada turma online.
 *
 * Regra validada pela gestora em 25/09/2026, já no Business Standard: o
 * professor entra direto e aceita os alunos que ficam na fila. Para isso a
 * sala precisa de acesso Confiável, moderação ligada e o professor como
 * coorganizador — que é exatamente o que a gestora configurava à mão.
 *
 * Aqui mora só a decisão; a chamada à API fica em `agenda/meet.ts`.
 */

export interface TurmaDaSala {
  modalidade: 'Presencial' | 'Online'
  status: 'Ativa' | 'Encerrada'
  link_videochamada: string | null
  /** Sala criada pelo sistema (`spaces/...`), se houver. */
  google_meet_sala: string | null
  /**
   * Etapa 6d: a turma continua em outra, que ficou com a mesma sala. Quem
   * manda nela e a continuacao; senao, sincronizar a turma antiga devolvia o
   * coorganizador ao professor de antes (revisao de 30/10/2026).
   */
  continuada?: boolean
}

export function oQueFazerComASala(turma: TurmaDaSala): 'criar' | 'ajustar' | 'nada' {
  if (turma.status !== 'Ativa' || turma.modalidade !== 'Online') return 'nada'
  if (turma.continuada) return 'nada'
  // A sala já existe: só confere o coorganizador. Criar outra trocaria o link
  // que alunos e professor já receberam.
  if (turma.google_meet_sala) return 'ajustar'
  // Link colado à mão é escolha da gestora, e o sistema não sobrescreve.
  if (turma.link_videochamada) return 'nada'
  return 'criar'
}

type Modalidade = 'Presencial' | 'Online'

/**
 * O link de uma aula. Desde 30/10/2026 a aula guarda a propria modalidade, e
 * "so esta aula" pode virar online numa turma presencial (ou o contrario).
 * Vale a modalidade da aula, nao a da turma: `link_online` e o link so desta
 * aula, e a sala da turma so serve se a turma tambem for online.
 */
export function linkDaAula(
  aula: { modalidade: Modalidade; link_online: string | null },
  turma: { modalidade: Modalidade; link_videochamada: string | null },
): string | null {
  if (aula.modalidade !== 'Online') return null
  return aula.link_online ?? (turma.modalidade === 'Online' ? turma.link_videochamada : null)
}

/**
 * Bug de 09/11/2026: a aula de turma presencial que virou online ficava sem
 * link. Ela ganha uma sala so dela, com a mesma configuracao da sala de turma.
 * Na turma online quem cuida da sala e a propria turma (`oQueFazerComASala`):
 * criar outra aqui deixaria dois links para os mesmos alunos.
 */
export function aulaPrecisaDeSala(
  aula: { modalidade: Modalidade; link_online: string | null; status: string },
  turma: { modalidade: Modalidade; link_videochamada: string | null },
): boolean {
  return (
    aula.status === 'Agendada' &&
    aula.modalidade === 'Online' &&
    !aula.link_online &&
    turma.modalidade !== 'Online'
  )
}

/**
 * Confiável: quem é da empresa ou foi convidado entra direto; o resto pede
 * para entrar. Moderação ligada: é o que habilita o coorganizador — e é o
 * coorganizador que aceita os alunos da fila.
 */
export const CONFIGURACAO_DA_SALA = {
  config: { accessType: 'TRUSTED', entryPointAccess: 'ALL', moderation: 'ON' },
} as const

export interface MembroDaSala {
  /** `spaces/{sala}/members/{membro}`. */
  name: string
  email?: string
  role?: string
}

/**
 * O que mudar para o professor atual — e só ele — ser o coorganizador.
 *
 * Remove o coorganizador antigo quando o professor da turma muda: ele não pode
 * continuar aceitando alunos numa turma que não é mais dele.
 */
export function ajustesDeCoorganizador(
  membros: MembroDaSala[],
  emailProfessor: string | null,
): { adicionar: string | null; remover: string[] } {
  const alvo = emailProfessor?.trim().toLowerCase() || null
  const coorganizadores = membros.filter((m) => m.role === 'COHOST')

  const remover = coorganizadores
    .filter((m) => m.email?.toLowerCase() !== alvo)
    .map((m) => m.name)

  const jaE = coorganizadores.some((m) => m.email?.toLowerCase() === alvo)

  return { adicionar: alvo && !jaE ? emailProfessor!.trim() : null, remover }
}
