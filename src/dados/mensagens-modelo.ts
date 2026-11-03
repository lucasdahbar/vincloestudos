import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { clienteServidor } from './cliente'
import { CHAVES, MODELOS, ehChaveDeModelo, type ModelosEditados } from '@/dominio/mensagens-modelo/catalogo'
import { validarModelo } from '@/dominio/mensagens-modelo/preencher'

/**
 * Textos das mensagens que a gestora reescreveu (tabela `mensagens_modelo`).
 * As regras de conferencia e o texto original ficam em `dominio/mensagens-modelo`.
 */

/**
 * O que foi editado, para quem monta uma mensagem. Aceita qualquer cliente
 * porque ha quem monte mensagem com a sessao (a tela) e quem monte com a
 * service role (o aviso da turma, dentro de `after()`).
 *
 * Falha em silencio, devolvendo "nada editado": a mensagem sai com o texto
 * original em vez de nao sair, que seria pior que sair sem a edicao.
 */
export async function carregarModelos(supabase: Pick<SupabaseClient, 'from'>): Promise<ModelosEditados> {
  const { data, error } = await supabase.from('mensagens_modelo').select('chave, texto')
  if (error || !data) return {}

  const editados: ModelosEditados = {}
  for (const linha of data as { chave: string; texto: string }[]) {
    if (ehChaveDeModelo(linha.chave)) editados[linha.chave] = linha.texto
  }
  return editados
}

/** Atalho para as telas, que ja trabalham com a sessao do usuario. */
export async function carregarModelosDaSessao(): Promise<ModelosEditados> {
  return carregarModelos(await clienteServidor())
}

export type Resultado = { ok: true } | { ok: false; erros: string[] }

export async function salvarModelo(
  chave: string,
  texto: string,
  usuario: string,
): Promise<Resultado> {
  if (!ehChaveDeModelo(chave)) return { ok: false, erros: ['Mensagem desconhecida.'] }

  const definicao = MODELOS[chave]
  // O navegador manda \r\n numa caixa de texto; o resto do sistema usa \n.
  const limpo = texto.replace(/\r\n/g, '\n').trim()
  const erros = validarModelo(
    limpo,
    definicao.campos.map((c) => c.nome),
    definicao.obrigatorios,
  )
  if (erros.length > 0) return { ok: false, erros }

  const supabase = await clienteServidor()

  // Igual ao original: apagar a edicao em vez de gravar uma copia, para que um
  // ajuste futuro no texto original chegue a quem nunca mexeu de verdade.
  if (limpo === definicao.padrao) return restaurarModelo(chave, usuario)

  const { error } = await supabase.from('mensagens_modelo').upsert({
    chave,
    texto: limpo,
    atualizado_em: new Date().toISOString(),
    atualizado_por: usuario,
  })
  if (error) return { ok: false, erros: [`Não foi possível salvar: ${error.message}`] }

  await registrar(supabase, 'editar_mensagem', chave, usuario)
  return { ok: true }
}

export async function restaurarModelo(chave: string, usuario: string): Promise<Resultado> {
  if (!ehChaveDeModelo(chave)) return { ok: false, erros: ['Mensagem desconhecida.'] }

  const supabase = await clienteServidor()
  const { error } = await supabase.from('mensagens_modelo').delete().eq('chave', chave)
  if (error) return { ok: false, erros: [`Não foi possível restaurar: ${error.message}`] }

  await registrar(supabase, 'restaurar_mensagem', chave, usuario)
  return { ok: true }
}

/** Quem editou e quando, por mensagem, para a tela mostrar. */
export async function autoriaDosModelos(): Promise<
  Partial<Record<(typeof CHAVES)[number], { por: string | null; em: string }>>
> {
  const supabase = await clienteServidor()
  const { data } = await supabase.from('mensagens_modelo').select('chave, atualizado_por, atualizado_em')

  const saida: Partial<Record<(typeof CHAVES)[number], { por: string | null; em: string }>> = {}
  for (const l of (data ?? []) as { chave: string; atualizado_por: string | null; atualizado_em: string }[]) {
    if (ehChaveDeModelo(l.chave)) saida[l.chave] = { por: l.atualizado_por, em: l.atualizado_em }
  }
  return saida
}

async function registrar(
  supabase: Pick<SupabaseClient, 'from'>,
  acao: string,
  chave: string,
  usuario: string,
) {
  await supabase.from('logs_operacionais').insert({
    acao,
    entidade: 'mensagens_modelo',
    usuario,
    detalhe: { chave },
  })
}
