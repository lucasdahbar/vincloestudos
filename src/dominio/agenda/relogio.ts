import { FUSO } from './evento-google'

/**
 * O horário de agora no relógio da escola, como AAAA-MM-DDTHH:MM.
 *
 * As aulas são gravadas com o horário de parede e sem fuso
 * (`2026-10-01T18:00:00`), então o banco as guarda como se fossem UTC. Comparar
 * isso com `new Date()` no servidor, que roda em UTC de verdade, desloca tudo
 * em três horas: foi o que fez o link do professor esconder aulas do mesmo dia.
 * Quem compara aula com agora usa este valor, no mesmo formato das aulas.
 */
export function agoraNaEscola(agora: Date): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(agora)
      .map((p) => [p.type, p.value]),
  )
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`
}
