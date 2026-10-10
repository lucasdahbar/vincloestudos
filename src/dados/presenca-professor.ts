import 'server-only'
import { clienteAdmin } from './admin'
import { professorPorToken, type ProfessorDoLink } from './professores'
import { montarRegistro, type RespostaChamada } from '@/dominio/presencas/registro'
import { concluirReposicoes, montarListaDaAula, type AlunoDaAula } from './lista-da-aula'
import {
  DIAS_A_FRENTE,
  modoDaAula,
  telaDoLink,
  ultimoDiaVisivel,
  type ModoDaAula,
  type TelaDoLink,
} from '@/dominio/presencas/link-professor'
import { agoraNaEscola } from '@/dominio/agenda/relogio'

/**
 * R1 (Rodada 2): o que o link pessoal do professor abre.
 *
 * O link nao carrega a aula — carrega o professor. Quais aulas mostrar e o que
 * cada uma permite e decidido no dominio (`link-professor.ts`). E por isso que
 * ele cobre turmas criadas depois de o link ter sido enviado.
 */

export type LeituraDoLink =
  | { ok: false; motivo: string }
  | { ok: true; professor: ProfessorDoLink; tela: TelaDoLink }

export async function aulasDoLink(token: string, agora = new Date()): Promise<LeituraDoLink> {
  const professor = await professorPorToken(token)
  if (!professor) {
    return { ok: false, motivo: 'Este link não é válido. Peça um novo à gestora.' }
  }

  const admin = clienteAdmin()
  const relogio = agoraNaEscola(agora)
  const hoje = relogio.slice(0, 10)

  const { data: turmas } = await admin.from('turmas').select('id').eq('professor_id', professor.id)
  const idsDasTurmas = (turmas ?? []).map((t) => t.id)
  if (idsDasTurmas.length === 0) {
    return { ok: true, professor, tela: telaDoLink([], relogio) }
  }

  // Do passado so interessa o que ainda esta sem chamada (e o confirmado de
  // hoje); o dominio aperta o resto. Aula cancelada ou em feriado nao tem
  // chamada para fazer.
  const { data } = await admin
    .from('aulas')
    .select('id, data_hora_inicio, data_hora_fim, status, turma:turmas!turma_id (nome)')
    .in('turma_id', idsDasTurmas)
    .in('status', ['Agendada', 'Realizada'])
    .or(`status.eq.Agendada,data_hora_inicio.gte.${hoje}T00:00:00`)
    .lte('data_hora_inicio', `${ultimoDiaVisivel(relogio)}T23:59:59`)
    .order('data_hora_inicio')

  const linhas = (data ?? []) as unknown as {
    id: number
    data_hora_inicio: string
    data_hora_fim: string
    status: string
    turma: { nome: string } | null
  }[]

  const aulas = linhas.map((l) => ({
    id: l.id,
    data: l.data_hora_inicio.slice(0, 10),
    horario_inicio: l.data_hora_inicio.slice(11, 16),
    horario_fim: l.data_hora_fim.slice(11, 16),
    turma_nome: l.turma?.nome ?? 'Turma',
    ja_registrada: l.status === 'Realizada',
  }))

  return { ok: true, professor, tela: telaDoLink(aulas, relogio) }
}

export interface ChamadaDoProfessor {
  aula_id: number
  turma_nome: string
  data_hora_inicio: string
  /** `registrar` abre a chamada; `consultar` so mostra quem vem. */
  modo: Exclude<ModoDaAula, 'fora'>
  /** Entram na chamada. */
  alunos: AlunoDaAula[]
  /** Rodada 3: avisaram que nao vem. Aparecem, sem presenca nem falta. */
  avisaram: { aluno_id: number; nome: string }[]
}

export async function chamadaDaAula(
  token: string,
  aulaId: number,
  agora = new Date(),
): Promise<{ ok: true; chamada: ChamadaDoProfessor } | { ok: false; motivo: string }> {
  const professor = await professorPorToken(token)
  if (!professor) return { ok: false, motivo: 'Este link não é válido.' }

  const admin = clienteAdmin()
  const { data: aula } = await admin
    .from('aulas')
    .select('id, data_hora_inicio, data_hora_fim, status, turma_id, turma:turmas!turma_id (nome, professor_id)')
    .eq('id', aulaId)
    .maybeSingle()

  if (!aula) return { ok: false, motivo: 'Esta aula não existe mais.' }

  const turma = aula.turma as unknown as { nome: string; professor_id: number } | null

  // Um id de aula na URL nao pode abrir a turma de outro professor.
  if (turma?.professor_id !== professor.id) {
    return { ok: false, motivo: 'Esta aula não é de uma turma sua.' }
  }

  if (aula.status === 'Excluída') return { ok: false, motivo: 'Esta aula foi excluída.' }
  if (aula.status !== 'Agendada' && aula.status !== 'Realizada') {
    return { ok: false, motivo: 'Esta aula foi cancelada.' }
  }

  const modo = modoDaAula(
    {
      id: aula.id,
      data: aula.data_hora_inicio.slice(0, 10),
      horario_inicio: aula.data_hora_inicio.slice(11, 16),
      horario_fim: String(aula.data_hora_fim).slice(11, 16),
      turma_nome: turma?.nome ?? '',
      ja_registrada: aula.status === 'Realizada',
    },
    agoraNaEscola(agora),
  )

  if (modo === 'fora') {
    return {
      ok: false,
      motivo: `Esta aula ainda está longe. O link mostra as aulas dos próximos ${DIAS_A_FRENTE} dias.`,
    }
  }

  const lista = await montarListaDaAula(admin, aula)

  return {
    ok: true,
    chamada: {
      aula_id: aula.id,
      turma_nome: turma?.nome ?? 'Turma',
      data_hora_inicio: aula.data_hora_inicio,
      modo,
      alunos: lista.chamada,
      avisaram: lista.avisaram.map(({ aluno_id, nome }) => ({ aluno_id, nome })),
    },
  }
}

export async function registrarChamadaDoProfessor(
  token: string,
  aulaId: number,
  respostas: RespostaChamada[],
  agora = new Date(),
): Promise<{ ok: true; ausentes: string[] } | { ok: false; motivo: string }> {
  const leitura = await chamadaDaAula(token, aulaId, agora)
  if (!leitura.ok) return leitura

  // A presenca trava depois de confirmada, como ja previsto: o professor pode
  // ter deixado a pagina aberta e clicado duas vezes.
  if (leitura.chamada.modo === 'confirmada') {
    return {
      ok: false,
      motivo: 'Esta chamada já foi confirmada. Peça à gestora para reabrir, se precisar corrigir.',
    }
  }

  if (leitura.chamada.modo === 'consultar') {
    return { ok: false, motivo: 'A chamada desta aula abre uma hora antes do início.' }
  }

  const professor = await professorPorToken(token)
  const admin = clienteAdmin()

  const resultado = montarRegistro({
    aulaId,
    professorId: professor?.id ?? null,
    matriculados: leitura.chamada.alunos,
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
      .upsert(resultado.pendencias, {
        onConflict: 'aluno_id,aula_origem_id',
        ignoreDuplicates: true,
      })
    if (error) return { ok: false, motivo: `Falha ao registrar as reposições: ${error.message}` }
  }

  await concluirReposicoes(admin, aulaId, resultado.presencas)
  await admin.from('aulas').update({ status: resultado.novoStatusAula }).eq('id', aulaId)

  await admin.from('logs_operacionais').insert({
    acao: 'registrar_chamada',
    entidade: 'aulas',
    entidade_id: aulaId,
    usuario: `professor:${professor?.id ?? 'desconhecido'}`,
    detalhe: {
      via: 'link_permanente',
      presencas: resultado.presencas.length,
      ausentes: resultado.ausentes.length,
      pendencias_geradas: resultado.pendencias.length,
    },
  })

  return { ok: true, ausentes: resultado.ausentes.map((a) => a.nome) }
}
