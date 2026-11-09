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

/*
 * Separacao das telas (decisao do Julio, 09/11/2026). Cobrancas e o que
 * ainda nao foi mandado: rascunho e confirmada nao enviada, e as canceladas
 * so pelo filtro. Do envio em diante a cobranca mora em Recebimentos, onde
 * Enviada se chama "Em aberto". O que conta como envio e a gestora clicar em
 * "Ja enviei" ou dar baixa (abrir o WhatsApp nao conta: ela pode desistir
 * para corrigir algo).
 */

export const OPCOES_DE_COBRANCAS = ['Rascunho', 'Confirmada', 'Cancelada'] as const
const PADRAO_DE_COBRANCAS = ['Rascunho', 'Confirmada']

/** Status do banco que a tela de Cobrancas mostra para a opcao escolhida. */
export function statusDaTelaDeCobrancas(opcao?: string): string[] {
  return opcao && (OPCOES_DE_COBRANCAS as readonly string[]).includes(opcao)
    ? [opcao]
    : PADRAO_DE_COBRANCAS
}

export const STATUS_EM_ABERTO = 'Em aberto'
export const TODAS = 'Todas'
export const OPCOES_DE_RECEBIMENTOS = [STATUS_EM_ABERTO, 'Parcial', 'Quitada', TODAS] as const

/**
 * Sem filtro, Recebimentos responde a pergunta do dia a dia ("quem ainda nao
 * pagou?"): em aberto e parcial juntos. As quitadas ficam no filtro.
 */
export function statusDaTelaDeRecebimentos(opcao?: string): string[] {
  switch (opcao) {
    case STATUS_EM_ABERTO:
      return ['Enviada']
    case 'Parcial':
    case 'Quitada':
      return [opcao]
    case TODAS:
      return ['Enviada', 'Parcial', 'Quitada']
    default:
      return ['Enviada', 'Parcial']
  }
}

/** O nome do status na tela. */
export function rotuloDoStatus(status: string): string {
  return status === 'Enviada' ? STATUS_EM_ABERTO : status
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
export function listaDeCobrancas<T extends CobrancaDaLista>(
  lista: T[],
  busca?: string,
  /** Status aceitos (veja statusDaTela...); sem a lista, todos. */
  status?: readonly string[],
): T[] {
  const palavras = semAcento(busca ?? '').split(/\s+/).filter(Boolean)

  const passaNoStatus = (c: T) => !status || status.includes(c.status ?? '')

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
