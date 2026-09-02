import 'server-only'
import { clienteAdmin } from './admin'
import { garantirTokenDoProfessor } from './professores'
import { montarAvisoDeTurma } from '@/dominio/turmas/aviso-professor'

/**
 * G4 (Rodada 2): avisa o professor por e-mail quando uma turma nova e criada.
 *
 * Envio de verdade depende de um provedor de e-mail, que a gestora ainda nao
 * contratou. Ate la o aviso entra na MESMA fila das outras mensagens do sistema
 * (`/mensagens`), de onde ela dispara com um clique — a arquitetura
 * semi-automatica que o proprio documento adota para as cobrancas.
 *
 * Quando `RESEND_API_KEY` existir no ambiente, o envio passa a ser automatico
 * sozinho, sem mexer em mais nada: a fila continua sendo o registro do que foi
 * mandado.
 */
export async function avisarProfessorDaTurma(
  turmaId: number,
  /** Origem do site, para montar o link de presenca. Vem de quem chamou porque
      `headers()` nao e confiavel dentro de `after()`. */
  urlBase: string,
): Promise<'enviado' | 'na-fila' | 'sem-email'> {
  const supabase = clienteAdmin()

  const { data: turma } = await supabase
    .from('turmas')
    .select(
      'id, nome, modalidade, tipo_recorrencia, data_unica, dias_semana, horario_inicio, horario_fim, link_videochamada, professor_id, materia:materias!materia_id (nome), escola:escolas!escola_id (nome), ano_escolar:anos_escolares!ano_escolar_id (nome), professor:professores!professor_id (id, nome, email)',
    )
    .eq('id', turmaId)
    .maybeSingle()

  const professor = turma?.professor as unknown as
    | { id: number; nome: string; email: string | null }
    | null

  if (!turma || !professor) return 'sem-email'
  if (!professor.email) return 'sem-email'

  const token = await garantirTokenDoProfessor(professor.id)

  const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

  const { assunto, corpo } = montarAvisoDeTurma({
    professor_nome: professor.nome,
    turma_nome: turma.nome,
    materia: um(turma.materia as unknown as { nome: string } | null)?.nome ?? null,
    ano_escolar: um(turma.ano_escolar as unknown as { nome: string } | null)?.nome ?? null,
    escola: um(turma.escola as unknown as { nome: string } | null)?.nome ?? null,
    modalidade: turma.modalidade,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_unica: turma.data_unica,
    dias_semana: turma.dias_semana ?? [],
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    link_videochamada: turma.link_videochamada ?? null,
    link_presenca: token ? `${urlBase}/p/professor/${token}` : null,
  })

  const enviou = await enviarEmail(professor.email, assunto, corpo)

  // A fila guarda o texto exato em qualquer um dos casos: enviado, e registro
  // do que ele recebeu; nao enviado, e a mensagem que a gestora dispara.
  await supabase.from('notificacoes').insert({
    tipo: 'TurmaCriada',
    canal: 'E-mail',
    destinatario_tipo: 'professor',
    destinatario_id: professor.id,
    texto_gerado: `${assunto}\n\n${corpo}`,
    status: enviou ? 'Enviada' : 'Pronta',
    enviado_em: enviou ? new Date().toISOString() : null,
    referencia_tipo: 'turma',
    referencia_id: turma.id,
  })

  return enviou ? 'enviado' : 'na-fila'
}

/**
 * Envia de fato, se houver provedor configurado. Devolve `false` — sem estourar
 * — quando nao ha: a turma nao pode deixar de ser criada porque o e-mail falhou.
 */
async function enviarEmail(para: string, assunto: string, corpo: string): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_REMETENTE
  if (!chave || !remetente) return false

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: remetente, to: para, subject: assunto, text: corpo }),
      signal: AbortSignal.timeout(10_000),
    })
    return resposta.ok
  } catch {
    return false
  }
}
