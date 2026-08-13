import type { Modalidade } from '@/dominio/tipos'

export interface ComponentesDoNome {
  materia: string | null
  anoEscolar: string | null
  escola: string | null
  servico: string | null
  modalidade: Modalidade | null
}

const SEPARADOR = ' · '

/**
 * Adendo v1.1, secao 5.2: o nome da turma e gerado por concatenacao e
 * recalculado sempre que um dos componentes muda. Componentes ausentes
 * (materia/escola condicionais, ou formulario ainda em preenchimento)
 * simplesmente nao entram.
 */
export function gerarNomeTurma(componentes: ComponentesDoNome): string {
  return [
    componentes.materia,
    componentes.anoEscolar,
    componentes.escola,
    componentes.servico,
    componentes.modalidade,
  ]
    .map((parte) => parte?.trim() ?? '')
    .filter((parte) => parte !== '')
    .join(SEPARADOR)
}
