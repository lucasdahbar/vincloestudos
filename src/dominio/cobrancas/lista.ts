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
}

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
export function listaDeCobrancas<T extends CobrancaDaLista>(lista: T[], busca?: string): T[] {
  const palavras = semAcento(busca ?? '').split(/\s+/).filter(Boolean)

  const passa = (c: T) => {
    if (palavras.length === 0) return true
    const nomes = [c.responsavel?.nome ?? '', ...c.alunos].map(semAcento)
    return palavras.every((p) => nomes.some((n) => n.includes(p)))
  }

  return lista.filter(passa).sort((a, b) => {
    if (!a.responsavel !== !b.responsavel) return a.responsavel ? -1 : 1
    return porNome.compare(a.responsavel?.nome ?? '', b.responsavel?.nome ?? '') || a.id - b.id
  })
}
