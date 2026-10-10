import type { Frequencia } from '@/dominio/tipos'
import { textoDaRegra } from '@/dominio/agenda/recorrencia'

/**
 * Quando a turma acontece, por extenso: "Segundas e quartas, às 15:00".
 *
 * O nome da turma (matéria · ano · escola · serviço · modalidade) não tem dia
 * nem horário, então duas turmas iguais em horários diferentes ficavam com o
 * mesmo texto nas listas — e a gestora não tinha como saber em qual matricular.
 */

export interface TurmaComHorario {
  nome: string
  tipo_recorrencia: 'Recorrente' | 'Único'
  /** ISO (AAAA-MM-DD). Só no modo Único. */
  data_unica: string | null
  dias_semana: number[] | null
  /** HH:MM ou HH:MM:SS, como o banco devolve. */
  horario_inicio: string
  /** Rodada 4. Ausentes = semanal, como as turmas de antes. */
  frequencia?: Frequencia | null
  intervalo?: number | null
  data_inicio?: string | null
}

export function quandoDaTurma(turma: TurmaComHorario): string {
  const hora = `às ${turma.horario_inicio.slice(0, 5)}`

  if (turma.tipo_recorrencia === 'Único' && turma.data_unica) {
    const [, mes, dia] = turma.data_unica.split('-')
    return `Aula única em ${dia}/${mes}, ${hora}`
  }

  const frequencia = turma.frequencia ?? 'Semanal'
  const dias = turma.dias_semana ?? []
  if (frequencia === 'Semanal' && dias.length === 0) return `Às ${turma.horario_inicio.slice(0, 5)}`
  if (frequencia === 'Mensal' && !turma.data_inicio) return `Às ${turma.horario_inicio.slice(0, 5)}`

  const regra = textoDaRegra({
    frequencia,
    intervalo: turma.intervalo ?? 1,
    dias_semana: dias,
    data_inicio: turma.data_inicio ?? '',
  })
  return `${regra}, ${hora}`
}

/** Nome e quando juntos, para seletores e listas de turma. */
export function rotuloDaTurma(turma: TurmaComHorario): string {
  return `${turma.nome} — ${quandoDaTurma(turma)}`
}

const ddmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** "De 01/10/2026 a 31/12/2026". Só para recorrente com período. */
export function periodoDaTurma(turma: {
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_inicio: string | null
  data_fim: string | null
}): string | null {
  if (turma.tipo_recorrencia !== 'Recorrente' || !turma.data_inicio || !turma.data_fim) return null
  return `De ${ddmmaaaa(turma.data_inicio)} a ${ddmmaaaa(turma.data_fim)}`
}
