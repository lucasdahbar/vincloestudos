import type { StatusAula } from '@/dominio/tipos'

/**
 * Remarcar uma aula (pedido do tio, 13/10/2026; spec 2026-10-13-remarcar-aula).
 *
 * Muda so dia e horario de uma aula: alunos, cobranca e reposicao seguem
 * como estavam. O horario que a regra da turma deu a aula fica guardado em
 * `original` — e por ele que a geracao automatica nao a recria no dia de
 * antes, e e a data dele que vale para matricula e cobranca.
 *
 * Horarios no formato das aulas, sem fuso: AAAA-MM-DDTHH:MM (relogio da escola).
 */
export interface AulaParaRemarcar {
  status: StatusAula
  temPresenca: boolean
  inicio: string
  fim: string
  /** Horario da regra, quando a aula ja foi remarcada antes. */
  original: string | null
  /** Termino no horario da regra (para reconhecer a volta ao original). */
  fimOriginal: string
}

export interface NovoHorario {
  /** AAAA-MM-DD */
  data: string
  /** HH:MM */
  inicio: string
  fim: string
}

export type PlanoRemarcacao =
  | { ok: false; erros: string[] }
  /** `original` nulo: a aula voltou ao dia e horario de sempre. */
  | { ok: true; inicio: string; fim: string; original: string | null }

const minuto = (v: string) => v.slice(0, 16)

export function planejarRemarcacao(
  aula: AulaParaRemarcar,
  nova: NovoHorario,
  agora: string,
): PlanoRemarcacao {
  if (aula.status === 'Excluída') return { ok: false, erros: ['Esta aula foi excluída.'] }
  if (aula.status === 'Realizada' || aula.temPresenca) {
    return { ok: false, erros: ['Esta aula já aconteceu: não dá para remarcar.'] }
  }
  if (aula.status !== 'Agendada') return { ok: false, erros: ['Só uma aula agendada pode ser remarcada.'] }

  const formato = /^\d{4}-\d{2}-\d{2}$/.test(nova.data) && /^\d{2}:\d{2}$/.test(nova.inicio) && /^\d{2}:\d{2}$/.test(nova.fim)
  if (!formato) return { ok: false, erros: ['Informe a nova data, o início e o término.'] }

  const inicio = `${nova.data}T${nova.inicio}`
  const fim = `${nova.data}T${nova.fim}`
  if (fim <= inicio) return { ok: false, erros: ['O término deve ser depois do início.'] }
  if (inicio < minuto(agora)) return { ok: false, erros: ['O novo horário já passou.'] }

  const original = minuto(aula.original ?? aula.inicio)
  const voltou = inicio === original && fim === minuto(aula.fimOriginal)

  return {
    ok: true,
    inicio: `${inicio}:00`,
    fim: `${fim}:00`,
    original: voltou ? null : `${original}:00`,
  }
}
