import type { SituacaoPrincipal } from '@/dominio/agenda/situacao'

/**
 * Etapa 3 (28/10/2026): a cor do selo de cada situacao, igual no mes, na
 * semana e na pagina da aula. Aguardando chamada em alerta, porque pede uma
 * acao; realizada em verde e concluida em verde cheio.
 */
export const ESTILO_SITUACAO: Record<SituacaoPrincipal, string> = {
  Criada: 'bg-superficie-2 text-tinta-suave border-borda hover:bg-borda',
  Confirmada: 'bg-destaque-suave text-destaque-forte border-destaque/30 hover:bg-destaque hover:text-white',
  'Aguardando chamada': 'bg-alerta-suave text-alerta border-alerta/30 hover:bg-alerta hover:text-white',
  Realizada: 'bg-apoio-suave text-apoio border-apoio/30 hover:bg-apoio hover:text-white',
  Concluída: 'bg-apoio text-white border-apoio hover:bg-apoio/80',
  Cancelada: 'bg-superficie-2 text-tinta-suave border-borda line-through hover:bg-borda',
  // Nao aparece na agenda (listarAulas filtra); so fecha o tipo.
  Excluída: 'bg-superficie-2 text-tinta-suave border-borda line-through hover:bg-borda',
  Feriado: 'bg-superficie-3 text-tinta-suave border-borda hover:bg-borda',
}

/** O selo sem o efeito de passar o mouse, para uma pilula dentro de um link. */
export function pilulaDaSituacao(s: SituacaoPrincipal): string {
  return ESTILO_SITUACAO[s].split(' hover:')[0]
}
