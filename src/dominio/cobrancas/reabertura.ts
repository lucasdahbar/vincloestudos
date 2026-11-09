import type { PodeCancelar, StatusCobranca } from './cancelamento'

/**
 * Reabrir rascunho (pedido do Julio, 09/11/2026): a gestora confirmou, viu um
 * erro numa aula antes de mandar e quer corrigir. Cancelar resolvia, mas
 * parecia que a cobranca tinha sumido. Reabrir devolve a mesma cobranca para
 * rascunho, com as aulas e os descontos dela.
 *
 * So Confirmada: Enviada o responsavel ja leu, e mudar o valor por baixo dele
 * e outra conversa (para essa, continua o cancelar). As travas sao as do
 * cancelamento (C7), pelos mesmos motivos: dinheiro que entrou e pagamento de
 * professor calculado sobre o valor cobrado.
 *
 * Credito ligado a um item (saida do aluno, decisao 11) tambem trava: o item
 * nao pode ser apagado enquanto o credito existir, e o rascunho e refeito a
 * cada geracao — a proxima geracao falharia para a familia inteira. O
 * cancelamento sabe desfazer esse credito; o reabrir, nao.
 */
export function podeReabrirCobranca(
  status: StatusCobranca,
  travas: { recebimentos: number; aulasPagasAoProfessor: number; creditos: number },
): PodeCancelar {
  if (status === 'Enviada') {
    return {
      pode: false,
      motivo: 'Esta cobrança já foi enviada ao responsável. Para corrigir, cancele e gere de novo.',
    }
  }
  if (status !== 'Confirmada') {
    return { pode: false, motivo: 'Só uma cobrança confirmada e ainda não enviada volta para rascunho.' }
  }
  if (travas.recebimentos > 0) {
    return { pode: false, motivo: 'Esta cobrança já tem pagamento registrado e não volta para rascunho.' }
  }
  if (travas.aulasPagasAoProfessor > 0) {
    return {
      pode: false,
      motivo: 'Esta cobrança já serviu de base para o pagamento de um professor e não volta para rascunho.',
    }
  }
  if (travas.creditos > 0) {
    return {
      pode: false,
      motivo:
        'Uma aula desta cobrança gerou crédito para o responsável. Para corrigir, cancele a cobrança (o crédito é desfeito junto) e gere de novo.',
    }
  }
  return { pode: true }
}
