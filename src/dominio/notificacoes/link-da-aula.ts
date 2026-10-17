import { planejarNotificacoes, type CanalEnvio, type ContextoNotificacao } from './mensagens'

/**
 * Envio do link da aula pela propria aula, na agenda (pedido de 16/10/2026).
 *
 * Antes os links saiam de uma fila unica (/mensagens), montada para as
 * proximas 48h e misturada com boas-vindas e avisos de professor. A gestora
 * trabalha aula por aula, e a fila dava a impressao de que mensagens ja
 * enviadas voltavam (era o link da aula seguinte, com o mesmo texto). Agora
 * cada aluno da aula tem o seu botao, e o clique ja registra o envio.
 */

/** Um envio ja gravado para esta aula (tabela `notificacoes`). */
export interface RegistroDeEnvio {
  destinatario_tipo: string
  destinatario_id: number
  canal: string
  status: string
  enviado_em: string | null
}

export interface DestinoDoLink {
  destinatario_tipo: 'aluno' | 'responsavel'
  destinatario_id: number
  canal: CanalEnvio
  /** Telefone (WhatsApp) ou e-mail. */
  contato: string | null
  texto: string
  rotulo: string
  /** Quando o link ja saiu para este destino; nulo se ainda nao. */
  enviado_em: string | null
}

/**
 * Para quem o link desta aula sai, seguindo a preferencia do aluno, e o que
 * ja foi enviado. A mesma regra das mensagens (`planejarNotificacoes`): o
 * texto nao pode divergir do que a fila mandava.
 */
export function destinosDoLink(
  ctx: ContextoNotificacao,
  registrados: RegistroDeEnvio[],
): DestinoDoLink[] {
  const planejadas = planejarNotificacoes({ ...ctx, tipo: 'LinkAula' })

  // O rotulo so diz quem e por onde quando ha mais de uma opcao.
  const variosDestinatarios = new Set(planejadas.map((p) => p.destinatario_tipo)).size > 1
  const variosCanais = new Set(planejadas.map((p) => p.canal)).size > 1

  return planejadas.map((p) => {
    const pessoa = p.destinatario_tipo === 'aluno' ? ctx.aluno : ctx.responsavel
    const enviado = registrados.find(
      (r) =>
        r.destinatario_tipo === p.destinatario_tipo &&
        r.destinatario_id === p.destinatario_id &&
        r.canal === p.canal &&
        r.status === 'Enviada',
    )

    const partes = ['Enviar link']
    if (variosDestinatarios) partes.push(p.destinatario_tipo === 'aluno' ? 'ao aluno' : 'ao responsável')
    if (variosCanais) partes.push(p.canal === 'WhatsApp' ? 'por WhatsApp' : 'por e-mail')

    return {
      destinatario_tipo: p.destinatario_tipo,
      destinatario_id: p.destinatario_id,
      canal: p.canal,
      contato: p.canal === 'WhatsApp' ? pessoa.telefone : pessoa.email,
      texto: p.texto_gerado,
      rotulo: partes.join(' '),
      enviado_em: enviado?.enviado_em ?? null,
    }
  })
}

/** Link que abre o WhatsApp com o texto pronto. Numero so com digitos. */
export function linkWhatsApp(contato: string | null, texto: string): string | null {
  if (!contato) return null
  const numero = contato.replace(/\D/g, '')
  if (numero.length < 10) return null
  const comPais = numero.startsWith('55') ? numero : `55${numero}`
  return `https://wa.me/${comPais}?text=${encodeURIComponent(texto)}`
}

/** Link que abre o programa de e-mail com assunto e corpo prontos. */
export function linkEmail(contato: string | null, assunto: string, corpo: string): string | null {
  if (!contato) return null
  return `mailto:${contato}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`
}
