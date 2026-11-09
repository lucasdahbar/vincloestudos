/**
 * Lista da tela de Cobrancas (pedido do Julio, 03/11/2026): a gestora revisa
 * os rascunhos do mes um a um, e procura a familia pelo nome do responsavel
 * ou de um dos filhos, porque nem sempre lembra quem e o responsavel.
 */
export interface CobrancaDaLista {
  id: number
  responsavel: { nome: string } | null
  /** Nomes dos alunos que a cobranca inclui. */
  alunos: string[]
  status?: string
}

/**
 * Filtro por status (pedido do Julio, 09/11/2026). Alem de cada status, uma
 * opcao que junta o que ainda falta receber: e a pergunta do dia a dia ("quem
 * ainda nao pagou?"), e com um status por vez a gestora teria de olhar tres listas.
 */
export const STATUS_EM_ABERTO = 'Em aberto'
const EM_ABERTO = ['Confirmada', 'Enviada', 'Parcial']

export const OPCOES_DE_STATUS = [
  STATUS_EM_ABERTO,
  'Rascunho',
  'Confirmada',
  'Enviada',
  'Parcial',
  'Quitada',
  'Cancelada',
] as const

/** Minusculas e sem acento: "João" e "joao" sao a mesma busca. */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const porNome = new Intl.Collator('pt-BR', { sensitivity: 'base' })

/**
 * Ordem alfabetica do responsavel; a cobranca complementar fica logo depois da
 * principal da mesma familia (ordem de criacao). Cada palavra da busca tem de
 * aparecer em algum nome — do responsavel ou de um aluno —, para "maria joao"
 * achar a Maria mae do Joao e nao toda Maria.
 */
export function listaDeCobrancas<T extends CobrancaDaLista>(
  lista: T[],
  busca?: string,
  status?: string,
): T[] {
  const palavras = semAcento(busca ?? '').split(/\s+/).filter(Boolean)

  const passaNoStatus = (c: T) => {
    if (!status) return true
    if (status === STATUS_EM_ABERTO) return EM_ABERTO.includes(c.status ?? '')
    return c.status === status
  }

  const passa = (c: T) => {
    if (!passaNoStatus(c)) return false
    if (palavras.length === 0) return true
    const nomes = [c.responsavel?.nome ?? '', ...c.alunos].map(semAcento)
    return palavras.every((p) => nomes.some((n) => n.includes(p)))
  }

  return lista.filter(passa).sort((a, b) => {
    if (!a.responsavel !== !b.responsavel) return a.responsavel ? -1 : 1
    return porNome.compare(a.responsavel?.nome ?? '', b.responsavel?.nome ?? '') || a.id - b.id
  })
}
