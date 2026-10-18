/**
 * O nome do negócio, num lugar só.
 *
 * A marca mudou de "Mesinha Redonda" para "Vinclo Estudos" em setembro de 2026,
 * e a troca pegou o nome espalhado por dez arquivos — título da aba, tela de
 * login, logo, mensagem de presença, descrição do evento no Google Agenda.
 * Concentrar aqui torna a próxima mudança uma linha, e não uma caçada.
 *
 * `PRIMEIRA` e `SEGUNDA` existem porque o logo pinta a segunda palavra com a
 * cor de destaque. Um nome de uma palavra só deixa `SEGUNDA` vazio, e o logo
 * continua funcionando.
 */
export const MARCA = 'Vinclo Estudos'

const [PRIMEIRA_PALAVRA, ...RESTO] = MARCA.split(' ')

export const PRIMEIRA = PRIMEIRA_PALAVRA
export const SEGUNDA = RESTO.join(' ')

/**
 * Para onde o responsavel escreve para corrigir ou apagar os dados (LGPD,
 * Art. 18), mostrado no formulario publico de cadastro. Decisao de 18/10/2026:
 * o e-mail da gestora, que e quem atende esses pedidos.
 */
export const EMAIL_DE_CONTATO = 'kellydahbar@vincloestudos.com.br'

/** Título de uma página interna: "Integrações — Vinclo Estudos". */
export function titulo(pagina: string): string {
  return `${pagina} — ${MARCA}`
}
