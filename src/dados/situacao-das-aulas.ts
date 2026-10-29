import 'server-only'
import { clienteAdmin } from './admin'
import { lerTudo } from './cobrancas'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { situacaoDaAula, type SituacaoDaAula } from '@/dominio/agenda/situacao'
import type { StatusAula } from '@/dominio/tipos'
import type { StatusCobranca } from '@/dominio/reposicoes/desfecho'

export interface AulaParaSituacao {
  id: number
  turma_id: number
  status: StatusAula
  data_hora_fim: string
  /** O dia que a matricula confere: o original, se a aula foi remarcada. */
  data_hora_referencia: string
}

const dia = (v: unknown) => String(v).slice(0, 10)

function emGrupos<T>(lista: T[], tamanho = 200): T[][] {
  const grupos: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) grupos.push(lista.slice(i, i + tamanho))
  return grupos
}

/**
 * Etapa 3 (28/10/2026): a situacao de cada aula, para o selo da agenda e da
 * pagina da aula. Tres leituras em lote (chamadas, itens de cobranca e
 * matriculas), nunca uma por aula: o mes da agenda tem centenas delas.
 *
 * Le com o cliente admin: o professor logado tambem ve o selo, e o RLS dele
 * nao alcanca cobrancas nem matriculas. So rotulos saem daqui; a pagina
 * decide o que o professor ve.
 *
 * Os alunos da aula seguem a regra de `lista-da-aula.ts`: matricula ativa da
 * turma que cobre a data de referencia (quem avisou que nao vem continua
 * contando).
 */
export async function situacoesDasAulas(aulas: AulaParaSituacao[]): Promise<Map<number, SituacaoDaAula>> {
  const resultado = new Map<number, SituacaoDaAula>()
  if (aulas.length === 0) return resultado

  const supabase = clienteAdmin()
  const ids = aulas.map((a) => a.id)
  const turmas = [...new Set(aulas.map((a) => a.turma_id))]

  const presencas: { aula_id: number; presente: boolean; conta: { status: 'Pendente' | 'Pago' } | null }[] = []
  const itens: { aula_id: number; cobranca: { status: StatusCobranca } }[] = []
  for (const grupo of emGrupos(ids)) {
    const [p, i] = await Promise.all([
      lerTudo((de, ate) =>
        supabase
          .from('presencas')
          .select('aula_id, presente, conta:contas_pagar_professor!conta_pagar_id (status)')
          .in('aula_id', grupo)
          .order('id')
          .range(de, ate),
      ),
      lerTudo((de, ate) =>
        supabase
          .from('itens_cobranca')
          .select('aula_id, cobranca:cobrancas!cobranca_id (status)')
          .in('aula_id', grupo)
          .order('id')
          .range(de, ate),
      ),
    ])
    presencas.push(...(p as unknown as typeof presencas))
    itens.push(...(i as unknown as typeof itens))
  }

  const matriculas = (await lerTudo((de, ate) =>
    supabase
      .from('matriculas')
      .select('turma_id, data_inicio, data_fim')
      .in('turma_id', turmas)
      .eq('status', 'Ativa')
      .order('id')
      .range(de, ate),
  )) as { turma_id: number; data_inicio: string; data_fim: string | null }[]

  const agora = agoraNaEscola(new Date()).slice(0, 16)

  for (const a of aulas) {
    const ref = dia(a.data_hora_referencia)
    const daAula = presencas.filter((p) => p.aula_id === a.id)
    resultado.set(
      a.id,
      situacaoDaAula({
        status: a.status,
        fim: String(a.data_hora_fim).slice(0, 16),
        agora,
        alunos: matriculas.filter(
          (m) => m.turma_id === a.turma_id && dia(m.data_inicio) <= ref && (!m.data_fim || dia(m.data_fim) >= ref),
        ).length,
        chamadaFeita: daAula.length > 0,
        cobrancas: itens.filter((i) => i.aula_id === a.id).map((i) => i.cobranca.status),
        pagamentos: daAula.filter((p) => p.presente).map((p) => p.conta?.status ?? null),
      }),
    )
  }
  return resultado
}
