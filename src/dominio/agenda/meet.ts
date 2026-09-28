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
}

export function oQueFazerComASala(turma: TurmaDaSala): 'criar' | 'ajustar' | 'nada' {
  if (turma.status !== 'Ativa' || turma.modalidade !== 'Online') return 'nada'
  // A sala já existe: só confere o coorganizador. Criar outra trocaria o link
  // que alunos e professor já receberam.
  if (turma.google_meet_sala) return 'ajustar'
  // Link colado à mão é escolha da gestora, e o sistema não sobrescreve.
  if (turma.link_videochamada) return 'nada'
  return 'criar'
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
