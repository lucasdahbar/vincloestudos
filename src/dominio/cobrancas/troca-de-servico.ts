import type { Centavos } from '@/dominio/dinheiro'
import type { StatusCobranca } from './cancelamento'

/**
 * Troca de servico em aula ja cobrada (Julio, 24/11/2026, caso Maira/Ana
 * Clara: a aula de 24/11 virou individual depois de cobrada como grupo).
 *
 * Antes a decisao 8 da varredura prendia o servico ao que foi cobrado, e nao
 * havia como cobrar a diferenca. Agora a aula muda, e o dinheiro acompanha:
 * - cobranca sem recebimento: o item muda de preco nela mesma, e a Kelly
 *   reenvia (resposta 2 do Julio). Nao pergunta nada: e so o preco certo;
 * - com recebimento e mais cara: a diferenca entra numa complementar, como a
 *   diferenca da reposicao (resposta original);
 * - com recebimento e mais barata: a diferenca vira credito (resposta 1).
 * A Kelly pode dispensar a diferenca na hora (Julio, 24/11/2026: "o sistema
 * pergunta"); a dispensa fica registrada. Aula ja no pagamento do professor
 * continua travada pela varredura (resposta 3).
 */

export interface ItemNaTroca {
  /** Status da cobranca do item. */
  status: StatusCobranca
  temRecebimento: boolean
  valor_original: Centavos
  /** O devido pela aula com o servico de hoje e com o novo (`devidoNaAula`). */
  antes: Centavos
  depois: Centavos
}

export type AcertoDaTroca =
  | { tipo: 'nada' }
  | { tipo: 'ajustar'; valor_original: Centavos }
  | { tipo: 'complementar'; valor: Centavos }
  | { tipo: 'credito'; valor: Centavos }
  /** Com sinal: positivo, a familia deveria mais. */
  | { tipo: 'dispensada'; valor: Centavos }

/** `aplicarDiferenca`: a resposta da Kelly a "cobrar a diferenca / gerar credito?". */
export function acertoDaTroca(i: ItemNaTroca, aplicarDiferenca: boolean): AcertoDaTroca {
  // Rascunho e refeito na proxima geracao com o servico novo.
  if (i.status === 'Rascunho' || i.status === 'Cancelada') return { tipo: 'nada' }
  const diferenca = i.depois - i.antes
  if (diferenca === 0) return { tipo: 'nada' }

  const semDinheiro = (i.status === 'Confirmada' || i.status === 'Enviada') && !i.temRecebimento
  if (semDinheiro) return { tipo: 'ajustar', valor_original: Math.max(0, i.valor_original + diferenca) }

  if (!aplicarDiferenca) return { tipo: 'dispensada', valor: diferenca }
  return diferenca > 0 ? { tipo: 'complementar', valor: diferenca } : { tipo: 'credito', valor: -diferenca }
}

/**
 * O que a aula vale para o aluno: o servico, ou, na reposicao (Rodada 3), so o
 * que a turma de destino custa a mais que a original.
 */
export function devidoNaAula(valorDoServico: Centavos, valorDaOriginal: Centavos | null): Centavos {
  return valorDaOriginal === null ? valorDoServico : Math.max(0, valorDoServico - valorDaOriginal)
}

/** A descricao do item leva o nome do servico ("Materia — Ano — Servico"). */
export function trocarServicoNaDescricao(descricao: string, antes: string, depois: string): string {
  return descricao.includes(antes) ? descricao.replace(antes, depois) : descricao
}

/**
 * Item da complementar. Parenteses, nao " — ": o texto da cobranca parte a
 * descricao nesse separador (geracao.ts).
 */
export function descricaoDaDiferenca(descricaoDaAula: string, antes: string, depois: string): string {
  const base = trocarServicoNaDescricao(descricaoDaAula, antes, depois).replace(/ \(.*\)$/, '')
  return `${base} (diferença da troca de serviço)`
}

export interface LinhaDoResumo {
  responsavel_id: number
  responsavel_nome: string
  complementar: Centavos
  credito: Centavos
  /** Aulas corrigidas na propria cobranca, ainda sem pagamento. */
  ajustadas: number
}

/** Para a previa: o que a troca faz em cada familia. */
export function resumoDaTroca(
  acertos: { responsavel_id: number; responsavel_nome: string; acerto: AcertoDaTroca }[],
): LinhaDoResumo[] {
  const porFamilia = new Map<number, LinhaDoResumo>()
  for (const { responsavel_id, responsavel_nome, acerto } of acertos) {
    if (acerto.tipo === 'nada') continue
    const linha = porFamilia.get(responsavel_id) ?? { responsavel_id, responsavel_nome, complementar: 0, credito: 0, ajustadas: 0 }
    if (acerto.tipo === 'complementar') linha.complementar += acerto.valor
    if (acerto.tipo === 'credito') linha.credito += acerto.valor
    if (acerto.tipo === 'dispensada') {
      if (acerto.valor > 0) linha.complementar += acerto.valor
      else linha.credito -= acerto.valor
    }
    if (acerto.tipo === 'ajustar') linha.ajustadas += 1
    porFamilia.set(responsavel_id, linha)
  }
  return [...porFamilia.values()]
}
