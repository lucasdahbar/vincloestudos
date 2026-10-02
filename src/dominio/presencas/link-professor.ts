/**
 * R1 (Rodada 2): link pessoal e permanente de presenca.
 *
 * Antes era um link por aula, que a gestora tinha de gerar e mandar toda vez.
 * Agora cada professor tem um unico link, mandado uma vez so, que lista as
 * aulas dele — inclusive de turmas criadas depois, sem precisar reenviar nada.
 *
 * O link mostra:
 * - toda aula que ja comecou e ainda nao tem chamada, sem limite de data: a
 *   chamada esquecida tem de continuar ao alcance do professor, senao vira
 *   trabalho manual da gestora;
 * - as chamadas ja confirmadas de hoje, para o professor ver que deu certo;
 * - os proximos dias, so para consulta de quem vem.
 *
 * O resto da agenda fica de fora: um link sem senha nao deve expor o passado
 * ja resolvido nem o futuro distante.
 */

/** Quanto antes do inicio a chamada ja abre: o professor abre o link antes de comecar. */
export const ABRE_ANTES_MIN = 60

/** Quantos dias para frente o link mostra, para o professor saber quem vem. */
export const DIAS_A_FRENTE = 7

export interface AulaDoProfessor {
  id: number
  /** Data em ISO, AAAA-MM-DD. */
  data: string
  /** HH:MM, no fuso local de quem da a aula. */
  horario_inicio: string
  horario_fim: string
  turma_nome: string
  /** Chamada ja confirmada: a presenca trava, como ja previsto. */
  ja_registrada: boolean
}

/**
 * O que o link pode fazer com uma aula.
 *
 * `agora` e o relogio de parede da escola (`agoraNaEscola`), no mesmo formato
 * das aulas — e o servidor que decide, nao o navegador do professor.
 */
export type ModoDaAula = 'registrar' | 'consultar' | 'confirmada' | 'fora'

export function modoDaAula(aula: AulaDoProfessor, agora: string): ModoDaAula {
  if (aula.ja_registrada) return 'confirmada'
  const inicio = emMinutos(aula.data, aula.horario_inicio)
  const minutosAgora = emMinutos(agora.slice(0, 10), agora.slice(11, 16))
  if (inicio - ABRE_ANTES_MIN <= minutosAgora) return 'registrar'
  return aula.data <= ultimoDiaVisivel(agora) ? 'consultar' : 'fora'
}

export interface TelaDoLink {
  /** Para marcar presenca, da mais recente para a mais antiga. */
  pendentes: AulaDoProfessor[]
  confirmadasHoje: AulaDoProfessor[]
  /** Proximos dias, em ordem: so consulta. */
  proximas: AulaDoProfessor[]
}

export function telaDoLink(aulas: AulaDoProfessor[], agora: string): TelaDoLink {
  const hoje = agora.slice(0, 10)
  const emOrdem = [...aulas].sort(
    (a, b) =>
      `${a.data}T${a.horario_inicio}`.localeCompare(`${b.data}T${b.horario_inicio}`) ||
      a.turma_nome.localeCompare(b.turma_nome, 'pt-BR'),
  )

  const pendentes = emOrdem.filter((a) => modoDaAula(a, agora) === 'registrar')
  // Inverte so a ordem dos horarios: no mesmo horario, o nome continua crescente.
  pendentes.sort(
    (a, b) =>
      `${b.data}T${b.horario_inicio}`.localeCompare(`${a.data}T${a.horario_inicio}`) ||
      a.turma_nome.localeCompare(b.turma_nome, 'pt-BR'),
  )

  return {
    pendentes,
    confirmadasHoje: emOrdem.filter((a) => a.ja_registrada && a.data === hoje),
    proximas: emOrdem.filter((a) => modoDaAula(a, agora) === 'consultar'),
  }
}

/** O ultimo dia que o link mostra, para a consulta ao banco nao trazer alem disso. */
export function ultimoDiaVisivel(agora: string): string {
  const [ano, mes, dia] = agora.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia + DIAS_A_FRENTE)).toISOString().slice(0, 10)
}

/** Em UTC de proposito: aula e agora estao no mesmo relogio de parede, sem fuso. */
function emMinutos(data: string, horario: string): number {
  const [ano, mes, dia] = data.split('-').map(Number)
  const [hora, minuto] = horario.split(':').map(Number)
  return Date.UTC(ano, mes - 1, dia, hora, minuto) / 60000
}
