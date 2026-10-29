import 'server-only'
import { randomBytes } from 'node:crypto'
import { clienteAdmin } from './admin'
import { clienteServidor } from './cliente'
import { type RespostaChamada } from '@/dominio/presencas/registro'
import { gravarChamada } from './gravar-chamada'
import { montarListaDaAula } from './lista-da-aula'

/** Validade padrao do link enviado ao professor. */
const HORAS_DE_VALIDADE = 48

export interface AulaDoFormulario {
  aula_id: number
  turma_nome: string
  data_hora_inicio: string
  professor_id: number | null
  alunos: { aluno_id: number; nome: string; flag_reposicao: boolean }[]
  /** Rodada 3: avisaram que nao vem. Aparecem, sem presenca nem falta. */
  avisaram: { aluno_id: number; nome: string }[]
}

export interface TokenDaAula {
  token: string
  expira_em: string
  usado_em: string | null
}

/**
 * Token valido da aula, se ja houver um.
 *
 * Existe para o botao de gerar link nao criar um token novo a cada clique: a
 * gestora costuma reabrir a tela varias vezes, e cada token novo invalidaria
 * na pratica o link que ela ja mandou para o professor.
 */
export async function tokenDaAula(aulaId: number): Promise<TokenDaAula | null> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('presenca_tokens')
    .select('token, expira_em, usado_em')
    .eq('aula_id', aulaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  if (new Date(data.expira_em) < new Date() && !data.usado_em) return null
  return data
}

export async function gerarTokenPresenca(aulaId: number): Promise<string> {
  const supabase = await clienteServidor()

  const { data: aula } = await supabase
    .from('aulas')
    .select('id, professor_id')
    .eq('id', aulaId)
    .maybeSingle()

  if (!aula) throw new Error('Aula não encontrada.')

  const token = randomBytes(24).toString('base64url')
  const expira = new Date(Date.now() + HORAS_DE_VALIDADE * 3600_000).toISOString()

  const { error } = await supabase.from('presenca_tokens').insert({
    token,
    aula_id: aulaId,
    professor_id: aula.professor_id,
    expira_em: expira,
  })

  if (error) throw new Error(`Falha ao gerar o link: ${error.message}`)
  return token
}

/**
 * Le a aula pelo token, sem sessao. Roda apenas no servidor e usa a service
 * role key: o RLS nega acesso anonimo as tabelas, e a autorizacao aqui e o
 * proprio token — de uso unico e com validade.
 */
export async function aulaPorToken(token: string): Promise<
  { ok: true; aula: AulaDoFormulario } | { ok: false; motivo: string }
> {
  const admin = clienteAdmin()

  const { data: registro } = await admin
    .from('presenca_tokens')
    .select('token, aula_id, professor_id, expira_em, usado_em')
    .eq('token', token)
    .maybeSingle()

  if (!registro) return { ok: false, motivo: 'Este link não é válido.' }
  if (registro.usado_em) {
    return {
      ok: false,
      motivo: 'Esta chamada já foi confirmada. Peça à gestora para reabrir, se precisar corrigir.',
    }
  }
  if (new Date(registro.expira_em) < new Date()) {
    return { ok: false, motivo: 'Este link expirou. Peça um novo à gestora.' }
  }

  const { data: aula } = await admin
    .from('aulas')
    .select('id, data_hora_inicio, data_hora_referencia, status, turma_id, turma:turmas!turma_id (nome)')
    .eq('id', registro.aula_id)
    .maybeSingle()

  if (!aula) return { ok: false, motivo: 'A aula deste link não existe mais.' }
  // A aula excluida fica no banco, mas nao tem chamada: gravar presenca aqui a
  // marcaria como Realizada e a traria de volta. A exclusao ja apaga os tokens;
  // este teste cobre o link aberto antes dela.
  if (aula.status === 'Excluída') return { ok: false, motivo: 'Esta aula foi excluída.' }

  // A mesma lista dos outros links: quem avisou que nao vem fica fora da
  // chamada. Este link montava a propria e gravava "presente" para ele.
  const lista = await montarListaDaAula(admin, aula)

  const turma = aula.turma as unknown as { nome: string } | null

  return {
    ok: true,
    aula: {
      aula_id: aula.id,
      turma_nome: turma?.nome ?? 'Turma',
      data_hora_inicio: aula.data_hora_inicio,
      professor_id: registro.professor_id,
      alunos: lista.chamada,
      avisaram: lista.avisaram.map(({ aluno_id, nome }) => ({ aluno_id, nome })),
    },
  }
}

/**
 * Grava a chamada inteira: presencas, pendencias de reposicao, status da aula e
 * o consumo do token. Sequencia unica — se algo falhar no meio, o token nao e
 * marcado como usado e o professor pode reenviar.
 */
export async function registrarChamada(
  token: string,
  respostas: RespostaChamada[],
): Promise<{ ok: true; ausentes: string[] } | { ok: false; motivo: string }> {
  const leitura = await aulaPorToken(token)
  if (!leitura.ok) return { ok: false, motivo: leitura.motivo }

  const admin = clienteAdmin()
  const { aula } = leitura

  const r = await gravarChamada(admin, {
    aulaId: aula.aula_id,
    professorId: aula.professor_id,
    matriculados: aula.alunos,
    respostas,
    usuario: `professor:${aula.professor_id ?? 'desconhecido'}`,
    via: 'link_da_aula',
  })
  if (!r.ok) return r

  // O link so se consome depois de gravar: se algo falhou, o professor reenvia.
  await admin.from('presenca_tokens').update({ usado_em: new Date().toISOString() }).eq('token', token)

  return r
}

/** A gestora pode reabrir a chamada, conforme Operacionais 5.5. */
export async function reabrirChamada(token: string): Promise<void> {
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('presenca_tokens')
    .update({ usado_em: null, reaberto_em: new Date().toISOString() })
    .eq('token', token)
  if (error) throw new Error(`Falha ao reabrir: ${error.message}`)
}
