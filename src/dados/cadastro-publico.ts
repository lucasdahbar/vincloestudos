import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { clienteAdmin } from './admin'
import { clienteServidor } from './cliente'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import {
  situacaoDoConvite,
  validadeDoConvite,
  type SituacaoConvite,
} from '@/dominio/cadastro-publico/convite'
import {
  validarEnvio,
  type EntradaEnvio,
  type EnvioValido,
} from '@/dominio/cadastro-publico/envio'
import { TEXTO_DO_ACEITE } from '@/dominio/cadastro-publico/privacidade'

/**
 * Cadastro pelo proprio responsavel (pedido do Julio, 17-18/10/2026).
 *
 * Duas portas: a da gestora (sessao, RLS "gestora total") e a do link publico
 * (service role, sem sessao). A porta publica so faz duas coisas: dizer se o
 * convite ainda vale e gravar um envio na fila. Ela nunca le responsaveis nem
 * alunos, para o link nao servir de consulta a dados de outras familias.
 */

/** Recusados e convites vencidos sem envio somem depois disso (LGPD: nao guardar sem motivo). */
const DIAS_ATE_APAGAR = 30

function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ── Porta da gestora ──────────────────────────────────────────────────────────

/**
 * Cria um convite e devolve o token. O token so existe neste momento: o banco
 * guarda o hash, entao um link perdido nao se recupera, gera-se outro.
 */
export async function criarConvite(
  identificacao: string,
): Promise<{ ok: true; token: string } | { ok: false; motivo: string }> {
  const supabase = await clienteServidor()
  const token = randomBytes(24).toString('base64url')

  const { error } = await supabase.from('convites_cadastro').insert({
    token_hash: hashDoToken(token),
    identificacao: identificacao.trim().slice(0, 120) || null,
    expira_em: validadeDoConvite(new Date()).toISOString(),
  })
  if (error) return { ok: false, motivo: error.message }
  return { ok: true, token }
}

export async function cancelarConvite(id: number): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('convites_cadastro')
    .update({ cancelado_em: new Date().toISOString() })
    .eq('id', id)
    .is('usado_em', null)
  return error ? { ok: false, motivo: error.message } : { ok: true }
}

export interface ConviteNaLista {
  id: number
  identificacao: string | null
  criado_em: string
  expira_em: string
  situacao: SituacaoConvite
}

export interface ResponsavelParecido {
  id: number
  nome: string
  /** O que bateu: ajuda a gestora a decidir entre vincular e criar novo. */
  coincide: ('CPF' | 'e-mail' | 'telefone')[]
}

export interface EnvioNaFila {
  id: number
  recebido_em: string
  identificacao: string | null
  dados: EnvioValido
  parecidos: ResponsavelParecido[]
}

export interface Fila {
  pendentes: EnvioNaFila[]
  convites: ConviteNaLista[]
}

/** Apaga o que nao tem mais motivo para ficar guardado. */
async function faxina(): Promise<void> {
  const supabase = await clienteServidor()
  const limite = new Date(Date.now() - DIAS_ATE_APAGAR * 24 * 60 * 60 * 1000).toISOString()

  // O envio recusado sai junto com o convite (on delete cascade).
  const { data: recusados } = await supabase
    .from('envios_cadastro')
    .select('convite_id')
    .eq('status', 'Recusado')
    .lt('decidido_em', limite)
  const ids = (recusados ?? []).map((r) => r.convite_id as number)
  if (ids.length > 0) await supabase.from('convites_cadastro').delete().in('id', ids)

  // Convite que venceu (ou foi cancelado) sem ninguem usar.
  await supabase
    .from('convites_cadastro')
    .delete()
    .is('usado_em', null)
    .lt('expira_em', limite)
  await supabase
    .from('convites_cadastro')
    .delete()
    .is('usado_em', null)
    .lt('cancelado_em', limite)
}

/** Para cada envio, os responsaveis ja cadastrados com o mesmo CPF, e-mail ou telefone. */
async function parecidosCom(envios: EnvioValido[]): Promise<ResponsavelParecido[][]> {
  if (envios.length === 0) return []
  const supabase = await clienteServidor()
  const cpfs = envios.map((e) => e.responsavel.cpf)
  const emails = envios.map((e) => e.responsavel.email)
  const telefones = envios.map((e) => e.responsavel.telefone)

  const lista = (valores: string[]) => valores.map((v) => `"${v.replace(/"/g, '')}"`).join(',')
  const { data } = await supabase
    .from('responsaveis')
    .select('id, nome, cpf, email, telefone')
    .or(`cpf.in.(${lista(cpfs)}),email.in.(${lista(emails)}),telefone.in.(${lista(telefones)})`)

  return envios.map((e) => {
    const mapa = new Map<number, ResponsavelParecido>()
    for (const r of data ?? []) {
      const coincide: ResponsavelParecido['coincide'] = []
      if (r.cpf && r.cpf === e.responsavel.cpf) coincide.push('CPF')
      if (r.email && String(r.email).toLowerCase() === e.responsavel.email) coincide.push('e-mail')
      if (r.telefone && r.telefone === e.responsavel.telefone) coincide.push('telefone')
      if (coincide.length > 0) mapa.set(r.id, { id: r.id, nome: r.nome, coincide })
    }
    return [...mapa.values()]
  })
}

export async function carregarFila(): Promise<Fila> {
  await faxina()
  const supabase = await clienteServidor()

  const [{ data: envios }, { data: convites }] = await Promise.all([
    supabase
      .from('envios_cadastro')
      .select('id, created_at, dados, convite:convites_cadastro!convite_id (identificacao)')
      .eq('status', 'Pendente')
      .order('created_at'),
    supabase
      .from('convites_cadastro')
      .select('id, identificacao, created_at, expira_em, usado_em, cancelado_em')
      .is('usado_em', null)
      .order('created_at', { ascending: false }),
  ])

  const pendentes = (envios ?? []) as unknown as {
    id: number
    created_at: string
    dados: EnvioValido
    convite: { identificacao: string | null } | null
  }[]
  const parecidos = await parecidosCom(pendentes.map((e) => e.dados))
  const agora = new Date()

  return {
    pendentes: pendentes.map((e, i) => ({
      id: e.id,
      recebido_em: e.created_at,
      identificacao: e.convite?.identificacao ?? null,
      dados: e.dados,
      parecidos: parecidos[i] ?? [],
    })),
    convites: (convites ?? []).map((c) => ({
      id: c.id,
      identificacao: c.identificacao,
      criado_em: c.created_at,
      expira_em: c.expira_em,
      situacao: situacaoDoConvite(c, agora),
    })),
  }
}

export async function aprovarEnvio(
  envioId: number,
  responsavelExistente: number | null,
): Promise<{ ok: true; responsavelId: number } | { ok: false; motivo: string }> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase.rpc('aprovar_envio_cadastro', {
    p_envio_id: envioId,
    p_responsavel_existente: responsavelExistente,
  })
  if (error) return { ok: false, motivo: error.message }
  return { ok: true, responsavelId: data as number }
}

export async function recusarEnvio(envioId: number): Promise<{ ok: boolean; motivo?: string }> {
  const supabase = await clienteServidor()
  // A copia dos dados fica so ate a faxina (30 dias), para a gestora poder
  // conferir se recusou por engano; o status nao volta para Pendente.
  const { error } = await supabase
    .from('envios_cadastro')
    .update({ status: 'Recusado', decidido_em: new Date().toISOString() })
    .eq('id', envioId)
    .eq('status', 'Pendente')
  return error ? { ok: false, motivo: error.message } : { ok: true }
}

// ── Porta publica (sem sessao) ────────────────────────────────────────────────

/** Formato basico antes de ir ao banco: um token de 24 bytes em base64url. */
function tokenBemFormado(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token)
}

/** Se o link ainda pode ser usado. Nao devolve nada sobre a familia. */
export async function situacaoDoLink(token: string): Promise<SituacaoConvite | 'inexistente'> {
  if (!tokenBemFormado(token)) return 'inexistente'
  const { data } = await clienteAdmin()
    .from('convites_cadastro')
    .select('expira_em, usado_em, cancelado_em')
    .eq('token_hash', hashDoToken(token))
    .maybeSingle()
  if (!data) return 'inexistente'
  return situacaoDoConvite(data, new Date())
}

export type ResultadoDoEnvio =
  | { ok: true }
  | { ok: false; erros: Record<string, string> }
  | { ok: false; motivo: SituacaoConvite | 'inexistente' | 'falha' }

export async function enviarCadastro(token: string, entrada: EntradaEnvio): Promise<ResultadoDoEnvio> {
  if (!tokenBemFormado(token)) return { ok: false, motivo: 'inexistente' }

  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const validacao = validarEnvio(entrada, hoje)
  if (!validacao.ok) return validacao

  const { data, error } = await clienteAdmin().rpc('registrar_envio_cadastro', {
    p_token_hash: hashDoToken(token),
    p_dados: validacao.envio,
    p_aceite_texto: TEXTO_DO_ACEITE,
  })
  if (error) {
    console.error('falha ao registrar envio de cadastro:', error.message)
    return { ok: false, motivo: 'falha' }
  }
  if (data !== 'ok') return { ok: false, motivo: data as SituacaoConvite | 'inexistente' }
  return { ok: true }
}
