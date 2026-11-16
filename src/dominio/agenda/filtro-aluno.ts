/**
 * Filtro por aluno na agenda (pedido do Julio, 15/11/2026).
 *
 * A aula e do aluno quando ele tem matricula na turma valendo no dia da aula
 * — a mesma janela que a cobranca usa (data_inicio <= dia <= data_fim). Assim
 * a reposicao em outra turma (matricula so na data) aparece, e nao aparecem
 * aulas de antes de ele entrar ou de depois de sair. Quem avisou que nao vem
 * continua vendo a aula: a matricula nao muda com o aviso.
 */
export interface JanelaDeMatricula {
  turma_id: number
  data_inicio: string
  data_fim: string | null
}

export function aulasDoAluno<A extends { turma_id: number; data_hora_referencia: string }>(
  aulas: A[],
  matriculas: JanelaDeMatricula[],
): A[] {
  return aulas.filter((a) => {
    const dia = a.data_hora_referencia.slice(0, 10)
    return matriculas.some(
      (m) =>
        m.turma_id === a.turma_id &&
        m.data_inicio <= dia &&
        (!m.data_fim || m.data_fim >= dia),
    )
  })
}
