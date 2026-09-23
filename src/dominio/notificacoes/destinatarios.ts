/**
 * Quem recebe cada mensagem, e onde procurar o nome e o contato dela.
 *
 * O mapa é um `Record` de propósito: um tipo novo de destinatário não compila
 * sem dizer em que tabela ele mora. Foi exatamente o que faltou quando o
 * professor entrou como destinatário (G4) — a lista de mensagens seguiu
 * procurando só em alunos e responsáveis, e todo aviso de professor aparecia
 * como "Contato removido".
 */
export type TipoDestinatario = 'aluno' | 'responsavel' | 'professor'

export const TABELA_DO_DESTINATARIO: Record<
  TipoDestinatario,
  'alunos' | 'responsaveis' | 'professores'
> = {
  aluno: 'alunos',
  responsavel: 'responsaveis',
  professor: 'professores',
}

export interface Contato {
  id: number
  nome: string
  telefone: string | null
  email: string | null
}

export type PessoasPorTipo = Record<TipoDestinatario, Map<number, Contato>>

export function identificarDestinatario(
  linha: { destinatario_tipo: string; destinatario_id: number; canal: string },
  pessoas: PessoasPorTipo,
): { destinatario_nome: string; contato: string | null } {
  const p = pessoas[linha.destinatario_tipo as TipoDestinatario]?.get(linha.destinatario_id)
  return {
    destinatario_nome: p?.nome ?? 'Contato removido',
    contato: linha.canal === 'WhatsApp' ? (p?.telefone ?? null) : (p?.email ?? null),
  }
}
