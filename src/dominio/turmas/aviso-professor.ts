import { nomesDosDias } from '@/dominio/tipos'

/**
 * G4 (Rodada 2): o texto do aviso que o professor recebe quando uma turma nova
 * e criada.
 *
 * Junta num lugar so o que ele precisa para dar a primeira aula sem perguntar
 * nada: que turma e, quando acontece, por onde entra na chamada de video e por
 * onde marca presenca.
 */
export interface DadosDoAviso {
  professor_nome: string
  turma_nome: string
  materia: string | null
  ano_escolar: string | null
  escola: string | null
  modalidade: string | null
  tipo_recorrencia: 'Recorrente' | 'Único'
  /** ISO, AAAA-MM-DD. So no modo Único. */
  data_unica: string | null
  dias_semana: number[]
  /** HH:MM. */
  horario_inicio: string
  horario_fim: string
  link_videochamada: string | null
  /** R1: o link permanente do professor, sempre o mesmo. */
  link_presenca: string | null
}

export interface AvisoDeTurma {
  assunto: string
  corpo: string
}

export function montarAvisoDeTurma(d: DadosDoAviso): AvisoDeTurma {
  const primeiroNome = d.professor_nome.trim().split(/\s+/)[0]

  const quando =
    d.tipo_recorrencia === 'Único' && d.data_unica
      ? `Data: ${dataCompleta(d.data_unica)}, das ${d.horario_inicio} às ${d.horario_fim}`
      : `Quando: ${nomesDosDias(d.dias_semana)}, das ${d.horario_inicio} às ${d.horario_fim}`

  const detalhes = [
    d.materia && `Matéria: ${d.materia}`,
    d.ano_escolar && `Ano escolar: ${d.ano_escolar}`,
    d.escola && `Escola: ${d.escola}`,
    d.modalidade && `Modalidade: ${d.modalidade}`,
  ].filter(Boolean) as string[]

  const corpo = [
    `Olá, ${primeiroNome}!`,
    '',
    `Você foi designado para a turma ${d.turma_nome}.`,
    '',
    ...detalhes,
    quando,
    '',
    d.link_videochamada ? `Link da videochamada: ${d.link_videochamada}` : null,
    d.link_presenca ? `Seu link de presença: ${d.link_presenca}` : null,
    // O link de presenca e permanente, e o professor precisa saber disso —
    // senao ele fica esperando um link novo a cada aula, que nao vem mais.
    d.link_presenca
      ? 'Esse link de presença é sempre o mesmo, para todas as suas turmas: guarde no celular. Ao abrir, ele mostra a aula do momento.'
      : null,
    '',
    'Qualquer dúvida, é só chamar.',
  ]
    .filter((l) => l !== null)
    .join('\n')

  return { assunto: `Nova turma: ${d.turma_nome}`, corpo }
}

function dataCompleta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
