type Modalidade = 'Presencial' | 'Online'

interface Campos {
  professor_id: number | null
  servico_id: number | null
  modalidade: Modalidade
}

export interface Trocas {
  aula: Partial<Campos>
  turma: Partial<Campos>
}

/**
 * O que gravar ao editar "so esta aula" (professor, servico, modalidade).
 *
 * Bug de 11/11/2026 (turma 321): na turma de aula unica, a turma e a propria
 * aula, mas a edicao gravava so na aula. A turma, o nome, o evento do Google
 * e as telas que leem a turma ficavam com o professor antigo, e tentar de novo
 * dava "Nada mudou nesta aula". Agora a turma acompanha a aula, e a troca
 * conta tambem quando so a turma esta diferente (conserta o dado ja quebrado).
 * Na recorrente, so a aula muda, como antes.
 */
/**
 * O que a varredura deve liberar. Bug de 13/11/2026: a aula ja estava com o
 * professor novo e so a turma com o antigo; o pedido olhava so a aula, saia
 * vazio, e a varredura respondia "Esta aula nao pode mudar."
 */
export function camposPedidos(t: Trocas): { professor: boolean; servico: boolean; modalidade: boolean } {
  const pede = (c: keyof Campos) => t.aula[c] !== undefined || t.turma[c] !== undefined
  return { professor: pede('professor_id'), servico: pede('servico_id'), modalidade: pede('modalidade') }
}

export function trocasDaAulaUnica(
  turma: Campos & { tipo_recorrencia: string },
  aula: Campos,
  pedido: { professorId: number | null; servicoId: number | null; modalidade: Modalidade | null },
): Trocas {
  const unica = turma.tipo_recorrencia === 'Único'
  const trocas: Trocas = { aula: {}, turma: {} }
  const campos: [keyof Campos, number | Modalidade | null][] = [
    ['professor_id', pedido.professorId],
    ['servico_id', pedido.servicoId],
    ['modalidade', pedido.modalidade],
  ]
  for (const [campo, novo] of campos) {
    if (novo === null) continue
    if (novo !== aula[campo]) Object.assign(trocas.aula, { [campo]: novo })
    if (unica && novo !== turma[campo]) Object.assign(trocas.turma, { [campo]: novo })
  }
  return trocas
}
