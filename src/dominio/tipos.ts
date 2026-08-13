export const MODALIDADES = ['Presencial', 'Online'] as const
export type Modalidade = (typeof MODALIDADES)[number]

export const STATUS_TURMA = ['Ativa', 'Encerrada'] as const
export type StatusTurma = (typeof STATUS_TURMA)[number]

export const STATUS_MATRICULA = ['Ativa', 'Encerrada'] as const
export type StatusMatricula = (typeof STATUS_MATRICULA)[number]

export const DESTINATARIOS_NOTIFICACAO = ['Aluno', 'Responsável', 'Ambos'] as const
export type DestinatarioNotificacao = (typeof DESTINATARIOS_NOTIFICACAO)[number]

export const CANAIS_NOTIFICACAO = ['WhatsApp', 'E-mail', 'Ambos'] as const
export type CanalNotificacao = (typeof CANAIS_NOTIFICACAO)[number]

export const TIPOS_CONTA = ['Banco', 'Dinheiro', 'Carteira digital'] as const
export type TipoConta = (typeof TIPOS_CONTA)[number]

export const ABRANGENCIAS_FERIADO = ['Nacional', 'Estadual', 'Municipal'] as const
export type AbrangenciaFeriado = (typeof ABRANGENCIAS_FERIADO)[number]

export const PAPEIS = ['gestora', 'professor'] as const
export type Papel = (typeof PAPEIS)[number]

/** Dias da semana no mesmo indice de `Date.getDay()`: 0 = domingo. */
export const DIAS_SEMANA = [
  { valor: 0, nome: 'Domingo', curto: 'Dom' },
  { valor: 1, nome: 'Segunda', curto: 'Seg' },
  { valor: 2, nome: 'Terça', curto: 'Ter' },
  { valor: 3, nome: 'Quarta', curto: 'Qua' },
  { valor: 4, nome: 'Quinta', curto: 'Qui' },
  { valor: 5, nome: 'Sexta', curto: 'Sex' },
  { valor: 6, nome: 'Sábado', curto: 'Sáb' },
] as const

export function nomesDosDias(dias: number[]): string {
  return dias
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DIAS_SEMANA.find((dia) => dia.valor === d)?.curto ?? '?')
    .join(', ')
}
