/**
 * Direito ao esquecimento (LGPD, Art. 18) — Requisitos v1.0, Secoes 4.4, 5.5,
 * 5.7, 6.3 e 6.5.
 *
 * A regra e a mesma para Professor, Responsavel e Aluno: se nao ha registro
 * financeiro vinculado, apaga de vez; se ha, anonimiza os dados pessoais e
 * PRESERVA os registros financeiros — a contabilidade nao pode perder o
 * historico so porque a pessoa pediu para sair.
 */
export type Entidade = 'professores' | 'responsaveis' | 'alunos'

export interface Vinculos {
  /** Quantidade de registros financeiros ligados a pessoa. */
  financeiros: number
  /** Vinculos operacionais (aulas, presencas, matriculas). */
  operacionais: number
}

export type Decisao =
  | { acao: 'excluir'; motivo: string }
  | { acao: 'anonimizar'; motivo: string }

export function decidirExclusao(vinculos: Vinculos): Decisao {
  if (vinculos.financeiros > 0) {
    return {
      acao: 'anonimizar',
      motivo:
        `Há ${vinculos.financeiros} registro(s) financeiro(s) vinculado(s). ` +
        'Os dados pessoais serão apagados e o histórico financeiro preservado.',
    }
  }

  if (vinculos.operacionais > 0) {
    return {
      acao: 'anonimizar',
      motivo:
        `Há ${vinculos.operacionais} registro(s) de aulas ou matrículas vinculado(s). ` +
        'Os dados pessoais serão apagados e o histórico de aulas preservado.',
    }
  }

  return { acao: 'excluir', motivo: 'Nenhum registro vinculado. O cadastro será apagado de vez.' }
}

/** Valores que substituem os dados pessoais na anonimizacao. */
export function camposAnonimizados(entidade: Entidade, id: number): Record<string, unknown> {
  const rotulo =
    entidade === 'professores' ? 'Professor' : entidade === 'alunos' ? 'Aluno' : 'Responsável'

  const comum: Record<string, unknown> = {
    nome: `${rotulo} removido #${id}`,
    telefone: null,
    email: null,
    ativo: false,
  }

  if (entidade === 'professores') return { ...comum, cpf: null, chave_pix: null }

  return {
    ...comum,
    cpf: null,
    ...(entidade === 'responsaveis'
      ? { cep: null, endereco: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, observacao: null }
      : { data_nascimento: null, observacao: null }),
  }
}
