import 'server-only'
import { randomBytes } from 'node:crypto'
import { clienteAdmin } from './admin'
import { clienteServidor } from './cliente'
import { montarRegistro, type RespostaChamada } from '@/dominio/presencas/registro'

/** Validade padrao do link enviado ao professor. */
const HORAS_DE_VALIDADE = 48

export interface AulaDoFormulario {
  aula_id: number
  turma_nome: string
  data_hora_inicio: string
  professor_id: number | null
  alunos: { aluno_id: number; nome: string; flag_reposicao: boolean }[]
}

export async function gerarTokenPresenca(aulaId: number): Promise<string> {
  const supabase = await clienteServidor()

  const { data: aula } = await supabase
    .from('aulas')
    .select('id, turma:turmas!turma_id (professor_id)')
    .eq('id', aulaId)
    .maybeSingle()

  if (!aula) throw new Error('Aula não encontrada.')

  const token = randomBytes(24).toString('base64url')
  const expira = new Date(Date.now() + HORAS_DE_VALIDADE * 3600_000).toISOString()
  const turma = aula.turma as unknown as { professor_id: number } | null

  const { error } = await supabase.from('presenca_tokens').insert({
    token,
    aula_id: aulaId,
    professor_id: turma?.professor_id ?? null,
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
    .select('id, data_hora_inicio, turma_id, turma:turmas!turma_id (nome)')
    .eq('id', registro.aula_id)
    .maybeSingle()

  if (!aula) return { ok: false, motivo: 'A aula deste link não existe mais.' }

  const dia = String(aula.data_hora_inicio).slice(0, 10)
  const { data: matriculas } = await admin
    .from('matriculas')
    .select('aluno_id, flag_reposicao, data_fim, aluno:alunos!aluno_id (nome)')
    .eq('turma_id', aula.turma_id)
    .eq('status', 'Ativa')
    .lte('data_inicio', dia)

  const alunos = ((matriculas ?? []) as unknown as {
    aluno_id: number
    flag_reposicao: boolean
    data_fim: string | null
    aluno: { nome: string } | null
  }[])
    .filter((m) => !m.data_fim || m.data_fim >= dia)
    .map((m) => ({
      aluno_id: m.aluno_id,
      nome: m.aluno?.nome ?? 'Aluno removido',
      flag_reposicao: m.flag_reposicao,
    }))

  const turma = aula.turma as unknown as { nome: string } | null

  return {
    ok: true,
    aula: {
      aula_id: aula.id,
      turma_nome: turma?.nome ?? 'Turma',
      data_hora_inicio: aula.data_hora_inicio,
      professor_id: registro.professor_id,
      alunos,
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

  const resultado = montarRegistro({
    aulaId: aula.aula_id,
    professorId: aula.professor_id,
    matriculados: aula.alunos,
    respostas,
  })

  if (resultado.presencas.length > 0) {
    const { error } = await admin
      .from('presencas')
      .upsert(resultado.presencas, { onConflict: 'aula_id,aluno_id' })
    if (error) return { ok: false, motivo: `Falha ao gravar as presenças: ${error.message}` }
  }

  if (resultado.pendencias.length > 0) {
    const { error } = await admin
      .from('pendencias_reposicao')
      .upsert(resultado.pendencias, { onConflict: 'aluno_id,aula_origem_id', ignoreDuplicates: true })
    if (error) return { ok: false, motivo: `Falha ao registrar as reposições: ${error.message}` }
  }

  await admin.from('aulas').update({ status: resultado.novoStatusAula }).eq('id', aula.aula_id)
  await admin.from('presenca_tokens').update({ usado_em: new Date().toISOString() }).eq('token', token)

  await admin.from('logs_operacionais').insert({
    acao: 'registrar_chamada',
    entidade: 'aulas',
    entidade_id: aula.aula_id,
    usuario: `professor:${aula.professor_id ?? 'desconhecido'}`,
    detalhe: {
      presencas: resultado.presencas.length,
      ausentes: resultado.ausentes.length,
      pendencias_geradas: resultado.pendencias.length,
    },
  })

  return { ok: true, ausentes: resultado.ausentes.map((a) => a.nome) }
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
