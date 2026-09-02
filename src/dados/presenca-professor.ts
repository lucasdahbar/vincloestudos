import 'server-only'
import { clienteAdmin } from './admin'
import { professorPorToken, type ProfessorDoLink } from './professores'
import { montarRegistro, semPendenciaDeReposicao, type RespostaChamada } from '@/dominio/presencas/registro'
import { podeAbrir, telaDoLink, type AulaDoProfessor, type TelaDoLink } from '@/dominio/presencas/link-professor'

/**
 * R1 (Rodada 2): o que o link pessoal do professor abre.
 *
 * O link nao carrega a aula — carrega o professor. Quem decide qual aula
 * mostrar e o relogio, no dominio (`link-professor.ts`). E por isso que ele
 * cobre turmas criadas depois de o link ter sido enviado.
 */

/** Quantos dias ao redor de hoje sao lidos do banco antes de o dominio filtrar. */
const DIAS_DE_FOLGA = 1

export type LeituraDoLink =
  | { ok: false; motivo: string }
  | { ok: true; professor: ProfessorDoLink; tela: TelaDoLink }

export async function aulasDoLink(token: string, agora = new Date()): Promise<LeituraDoLink> {
  const professor = await professorPorToken(token)
  if (!professor) {
    return { ok: false, motivo: 'Este link não é válido. Peça um novo à gestora.' }
  }

  const admin = clienteAdmin()

  // Busca uma janela larga e deixa o dominio apertar: a regra de "perto de
  // agora" mora num lugar so, testada, em vez de virar aritmetica de data
  // espalhada pela consulta.
  const de = deslocar(agora, -DIAS_DE_FOLGA)
  const ate = deslocar(agora, DIAS_DE_FOLGA)

  const { data } = await admin
    .from('aulas')
    .select('id, data_hora_inicio, data_hora_fim, status, turma:turmas!turma_id (nome, professor_id)')
    .gte('data_hora_inicio', `${de}T00:00:00`)
    .lte('data_hora_inicio', `${ate}T23:59:59`)
    .order('data_hora_inicio')

  const linhas = (data ?? []) as unknown as {
    id: number
    data_hora_inicio: string
    data_hora_fim: string
    status: string
    turma: { nome: string; professor_id: number } | null
  }[]

  const doProfessor = linhas.filter((l) => l.turma?.professor_id === professor.id)

  // Aula cancelada ou em feriado nao tem chamada para fazer.
  const abertas = doProfessor.filter((l) => l.status === 'Agendada' || l.status === 'Realizada')

  const aulas: AulaDoProfessor[] = abertas.map((l) => ({
    id: l.id,
    data: l.data_hora_inicio.slice(0, 10),
    horario_inicio: l.data_hora_inicio.slice(11, 16),
    horario_fim: l.data_hora_fim.slice(11, 16),
    turma_nome: l.turma?.nome ?? 'Turma',
    ja_registrada: l.status === 'Realizada',
  }))

  return { ok: true, professor, tela: telaDoLink(aulas, agora) }
}

export interface ChamadaDoProfessor {
  aula_id: number
  turma_nome: string
  data_hora_inicio: string
  ja_registrada: boolean
  alunos: { aluno_id: number; nome: string; flag_reposicao: boolean }[]
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

  const dentroDaJanela = podeAbrir(
    {
      id: aula.id,
      data: aula.data_hora_inicio.slice(0, 10),
      horario_inicio: aula.data_hora_inicio.slice(11, 16),
      horario_fim: String(aula.data_hora_fim).slice(11, 16),
      turma_nome: turma?.nome ?? '',
      ja_registrada: aula.status === 'Realizada',
    },
    agora,
  )

  if (!dentroDaJanela) {
    return {
      ok: false,
      motivo: 'Esta aula está fora do horário de registro. O link abre as aulas próximas ao horário atual.',
    }
  }

  const alunos = await matriculadosDaAula(aula.turma_id, aula.id, aula.data_hora_inicio.slice(0, 10))

  return {
    ok: true,
    chamada: {
      aula_id: aula.id,
      turma_nome: turma?.nome ?? 'Turma',
      data_hora_inicio: aula.data_hora_inicio,
      ja_registrada: aula.status === 'Realizada',
      alunos,
    },
  }
}

/**
 * A lista de alunos de uma aula, ja com R3 aplicado: quem tem pendencia de
 * reposicao em aberto para ESTA aula nao aparece.
 *
 * Exportada porque a agenda da gestora precisa da mesma lista — se as duas
 * telas divergirem, o professor e a gestora passam a ver turmas diferentes.
 */
export async function matriculadosDaAula(
  turmaId: number,
  aulaId: number,
  dia: string,
): Promise<{ aluno_id: number; nome: string; flag_reposicao: boolean }[]> {
  const admin = clienteAdmin()

  const [{ data: matriculas }, { data: pendencias }] = await Promise.all([
    admin
      .from('matriculas')
      .select('aluno_id, flag_reposicao, data_fim, aluno:alunos!aluno_id (nome)')
      .eq('turma_id', turmaId)
      .eq('status', 'Ativa')
      .lte('data_inicio', dia),
    admin
      .from('pendencias_reposicao')
      .select('aluno_id')
      .eq('aula_origem_id', aulaId)
      .eq('status', 'Pendente'),
  ])

  const lista = ((matriculas ?? []) as unknown as {
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

  return semPendenciaDeReposicao(lista, pendencias ?? [])
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
  if (leitura.chamada.ja_registrada) {
    return {
      ok: false,
      motivo: 'Esta chamada já foi confirmada. Peça à gestora para reabrir, se precisar corrigir.',
    }
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

function deslocar(base: Date, dias: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
