import type { TipoRecorrencia } from '@/dominio/tipos'

/**
 * Etapa 4 de "turmas como agenda" (28/10/2026): a tela de Turmas mostra as
 * series com aula pela frente. A aula unica vive na agenda, e a turma que
 * terminou sai sozinha.
 */
export interface TurmaDaLista {
  tipo_recorrencia: TipoRecorrencia
  status: 'Ativa' | 'Encerrada'
  /** ISO. So na aula unica. */
  data_unica: string | null
  /** ISO. Ultimo dia da serie. */
  data_fim: string | null
  /** O fim de 31/12 foi posto pelo sistema, e nao pela gestora. */
  fim_automatico: boolean
}

const dia = (v: string | null) => (v ? v.slice(0, 10) : null)

/**
 * A turma terminou e fecha sozinha (doc, "Encerrar com data passada ou
 * futura"): a aula unica que ja passou, e a serie cujo fim a gestora escolheu
 * e ja passou. O fim de 31/12 posto pelo sistema fica de fora: e a renovacao
 * de fim de ano que decide essas.
 */
export function turmaVencida(t: TurmaDaLista, hoje: string): boolean {
  if (t.status !== 'Ativa') return false
  if (t.tipo_recorrencia === 'Único') {
    const d = dia(t.data_unica)
    return d !== null && d < hoje
  }
  const fim = dia(t.data_fim)
  return !t.fim_automatico && fim !== null && fim < hoje
}

/** Entra na lista padrao de Turmas: serie ativa que ainda tem aula. */
export function temAulaPelaFrente(t: TurmaDaLista, hoje: string): boolean {
  if (t.tipo_recorrencia === 'Único' || t.status !== 'Ativa') return false
  const fim = dia(t.data_fim)
  return fim === null || fim >= hoje
}

/**
 * Quem conta como aluno da turma na lista. A matricula avulsa (um dia so) e a
 * de reposicao contam a parte, e so as que ainda vao acontecer: 55 avulsas de
 * dias que ja passaram inflavam a contagem.
 */
export function alunosDaTurma(
  matriculas: { flag_reposicao: boolean; data_inicio: string; data_fim: string | null }[],
  hoje: string,
): { fixos: number; avulsos: number; reposicoes: number } {
  const r = { fixos: 0, avulsos: 0, reposicoes: 0 }
  for (const m of matriculas) {
    const fim = dia(m.data_fim)
    if (fim !== null && fim < hoje) continue
    if (m.flag_reposicao) r.reposicoes++
    else if (fim !== null && fim === dia(m.data_inicio)) r.avulsos++
    else r.fixos++
  }
  return r
}
