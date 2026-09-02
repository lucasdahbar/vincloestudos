import type { Papel } from '@/dominio/tipos'

export interface ItemNav {
  rotulo: string
  href: string
  papeis?: Papel[]
  /** Aparece na barra inferior do celular. */
  principal?: boolean
}

export interface SecaoNav {
  titulo: string
  itens: ItemNav[]
}

/** Fonte unica da navegacao: a lateral do desktop e a barra do celular leem daqui. */
export const SECOES: SecaoNav[] = [
  {
    titulo: 'Dia a dia',
    itens: [
      { rotulo: 'Início', href: '/', principal: true },
      { rotulo: 'Agenda', href: '/agenda', principal: true },
      { rotulo: 'Turmas', href: '/turmas', principal: true },
      { rotulo: 'Matrículas', href: '/matriculas', papeis: ['gestora'] },
      { rotulo: 'Reposições', href: '/reposicoes', papeis: ['gestora'] },
      { rotulo: 'Mensagens', href: '/mensagens', papeis: ['gestora'] },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { rotulo: 'Cobranças', href: '/cobrancas', papeis: ['gestora'], principal: true },
      { rotulo: 'Recebimentos', href: '/recebimentos', papeis: ['gestora'] },
      { rotulo: 'Pagamentos', href: '/pagamentos', papeis: ['gestora'] },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { rotulo: 'Responsáveis', href: '/cadastros/responsaveis', papeis: ['gestora'] },
      { rotulo: 'Alunos', href: '/cadastros/alunos', papeis: ['gestora'] },
      { rotulo: 'Professores', href: '/cadastros/professores', papeis: ['gestora'] },
      { rotulo: 'Escolas', href: '/cadastros/escolas', papeis: ['gestora'] },
      { rotulo: 'Serviços', href: '/cadastros/servicos', papeis: ['gestora'] },
      { rotulo: 'Matérias', href: '/cadastros/materias', papeis: ['gestora'] },
      { rotulo: 'Anos escolares', href: '/cadastros/anos-escolares', papeis: ['gestora'] },
      { rotulo: 'Contas', href: '/cadastros/contas', papeis: ['gestora'] },
      { rotulo: 'Feriados', href: '/cadastros/feriados', papeis: ['gestora'] },
      { rotulo: 'Recessos escolares', href: '/cadastros/recessos', papeis: ['gestora'] },
      { rotulo: 'Integrações', href: '/cadastros/integracoes', papeis: ['gestora'] },
    ],
  },
]

export function visiveisPara(papel: Papel): SecaoNav[] {
  return SECOES.map((s) => ({
    ...s,
    itens: s.itens.filter((i) => !i.papeis || i.papeis.includes(papel)),
  })).filter((s) => s.itens.length > 0)
}

export function ehAtivo(href: string, caminho: string): boolean {
  return href === '/' ? caminho === '/' : caminho.startsWith(href)
}
