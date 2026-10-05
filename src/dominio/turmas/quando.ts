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
}

const SINGULAR = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]
const PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados']

export function quandoDaTurma(turma: TurmaComHorario): string {
  const hora = `às ${turma.horario_inicio.slice(0, 5)}`

  if (turma.tipo_recorrencia === 'Único' && turma.data_unica) {
    const [, mes, dia] = turma.data_unica.split('-')
    return `Aula única em ${dia}/${mes}, ${hora}`
  }

  const dias = [...new Set(turma.dias_semana ?? [])].sort((a, b) => a - b)
  if (dias.length === 0) return `Às ${turma.horario_inicio.slice(0, 5)}`
  if (dias.length === 1) return `${SINGULAR[dias[0]]}, ${hora}`

  const nomes = dias.map((d) => PLURAL[d])
  const lista = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `${lista[0].toUpperCase()}${lista.slice(1)}, ${hora}`
}

/** Nome e quando juntos, para seletores e listas de turma. */
export function rotuloDaTurma(turma: TurmaComHorario): string {
  return `${turma.nome} — ${quandoDaTurma(turma)}`
}
