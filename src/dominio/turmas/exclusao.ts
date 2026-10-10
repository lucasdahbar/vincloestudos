/**
 * Rodada 4 (spec 6.1): a turma inteira só pode ser excluída se nunca teve
 * aluno nem histórico. Aula gerada sem nada ligado a ela não conta — antes
 * contava, e na prática nenhuma turma podia ser excluída.
 */
export interface HistoricoDaTurma {
  /** Qualquer status, inclusive de reposição. */
  matriculas: number
  presencas: number
  /** Pendências com origem ou destino nas aulas da turma. */
  reposicoes: number
  /** Itens de cobrança das aulas da turma. */
  cobrancas: number
  /** Itens de pagamento de professor da turma. */
  pagamentos: number
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function avaliarExclusaoTurma(h: HistoricoDaTurma): { podeExcluir: boolean; motivo: string } {
  if (h.pagamentos > 0) {
    return {
      podeExcluir: false,
      motivo:
        'Esta turma já entrou no pagamento de um professor. Excluir apagaria histórico financeiro, ' +
        'então ela só pode ser encerrada.',
    }
  }

  const partes = [
    h.matriculas > 0 && plural(h.matriculas, 'matrícula', 'matrículas'),
    h.presencas > 0 && plural(h.presencas, 'presença registrada', 'presenças registradas'),
    h.reposicoes > 0 && plural(h.reposicoes, 'reposição', 'reposições'),
    h.cobrancas > 0 && plural(h.cobrancas, 'aula cobrada', 'aulas cobradas'),
  ].filter((p): p is string => Boolean(p))

  if (partes.length > 0) {
    return {
      podeExcluir: false,
      motivo:
        `Esta turma tem ${partes.join(', ')}. Encerre a turma em vez de excluir: o evento sai da ` +
        'agenda do professor e o histórico continua de pé.',
    }
  }

  return {
    podeExcluir: true,
    motivo:
      'Esta turma nunca teve aluno nem histórico. Excluir apaga o cadastro e as aulas geradas e ' +
      'retira o evento da agenda do professor. Não tem como voltar atrás.',
  }
}
