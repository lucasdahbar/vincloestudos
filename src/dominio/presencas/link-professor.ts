/**
 * R1 (Rodada 2): link pessoal e permanente de presenca.
 *
 * Antes era um link por aula, que a gestora tinha de gerar e mandar toda vez.
 * Agora cada professor tem um unico link, mandado uma vez so, que mostra
 * sozinho a aula do momento — inclusive de turmas criadas depois, sem precisar
 * reenviar nada.
 *
 * O preco de um link permanente e que ele nao pode dar acesso a tudo: quem
 * tiver o endereco enxergaria a agenda inteira do professor, passada e futura.
 * Por isso a janela abaixo — o link so abre as aulas perto da hora atual.
 */

/** Quanto antes do inicio a aula ja aparece: o professor abre o link antes de comecar. */
export const ABRE_ANTES_MIN = 60

/**
 * Quanto depois do fim a aula ainda aceita chamada. Generoso de proposito: o
 * professor que so lembra de marcar no fim do dia nao pode ficar travado — a
 * alternativa e ele pedir para a gestora fazer na mao.
 */
export const FECHA_DEPOIS_MIN = 6 * 60

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

export interface AulaAcessivel extends AulaDoProfessor {
  /** Distancia em minutos entre agora e o inicio da aula. Negativo = ja comecou. */
  minutosAteInicio: number
}

/**
 * As aulas que o link pode abrir agora, da mais proxima para a mais distante.
 *
 * `agora` entra como parametro em vez de vir de `new Date()` para o teste poder
 * fixar o relogio — e porque o servidor decide a janela, nao o navegador do
 * professor.
 */
export function aulasAcessiveis(
  aulas: AulaDoProfessor[],
  agora: Date,
): AulaAcessivel[] {
  const minutosAgora = agora.getTime() / 60000

  return aulas
    .map((a) => ({
      ...a,
      minutosAteInicio: emMinutos(a.data, a.horario_inicio) - minutosAgora,
    }))
    .filter((a) => {
      const fim = emMinutos(a.data, a.horario_fim) - minutosAgora
      return a.minutosAteInicio <= ABRE_ANTES_MIN && fim >= -FECHA_DEPOIS_MIN
    })
    .sort(
      (a, b) =>
        Math.abs(a.minutosAteInicio) - Math.abs(b.minutosAteInicio) ||
        a.turma_nome.localeCompare(b.turma_nome, 'pt-BR'),
    )
}

/**
 * O que a tela do link deve mostrar.
 *
 * Uma aula so: abre direto a chamada, que e o caso da esmagadora maioria das
 * vezes. Mais de uma no mesmo horario: lista curta para o professor escolher,
 * porque adivinhar qual delas ele quer seria pior do que perguntar.
 */
export type TelaDoLink =
  | { tipo: 'nenhuma' }
  | { tipo: 'uma'; aula: AulaAcessivel }
  | { tipo: 'escolher'; aulas: AulaAcessivel[] }

export function telaDoLink(aulas: AulaDoProfessor[], agora: Date): TelaDoLink {
  const acessiveis = aulasAcessiveis(aulas, agora)

  if (acessiveis.length === 0) return { tipo: 'nenhuma' }
  if (acessiveis.length === 1) return { tipo: 'uma', aula: acessiveis[0] }
  return { tipo: 'escolher', aulas: acessiveis }
}

/** Uma aula so pode ser aberta pelo link se estiver na janela — checado de novo ao gravar. */
export function podeAbrir(aula: AulaDoProfessor, agora: Date): boolean {
  return aulasAcessiveis([aula], agora).length === 1
}

function emMinutos(data: string, horario: string): number {
  const [ano, mes, dia] = data.split('-').map(Number)
  const [hora, minuto] = horario.split(':').map(Number)
  return new Date(ano, mes - 1, dia, hora, minuto).getTime() / 60000
}
