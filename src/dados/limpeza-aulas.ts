import 'server-only'
import { clienteAdmin } from './admin'
import { calendarioEscolar } from './calendario'
import { sincronizarEventoDaTurma } from './evento-da-turma'
import { datasPuladas } from '@/dominio/agenda/datas-puladas'
import { aulasParaApagar, temAlunoNaData } from '@/dominio/agenda/limpeza'
import { datasDaRegra } from '@/dominio/agenda/recorrencia'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import type { Frequencia } from '@/dominio/tipos'

type TurmaDaLimpeza = {
  id: number
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_unica: string | null
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[] | null
  data_inicio: string | null
  data_fim: string | null
  horario_inicio: string
  escola_id: number | null
  status: 'Ativa' | 'Encerrada'
}

const dia = (v: unknown) => String(v).slice(0, 10)

/** As datas em que a turma deve ter aula entre `de` e `ate`. */
async function datasValidas(turma: TurmaDaLimpeza, de: string, ate: string): Promise<Set<string>> {
  if (turma.tipo_recorrencia === 'Único') {
    return new Set(turma.data_unica ? [dia(turma.data_unica)] : [])
  }
  if (!turma.frequencia || !turma.data_inicio || !turma.data_fim) return new Set()

  const calendario = await calendarioEscolar(clienteAdmin(), de, ate)
  const puladas = datasPuladas(turma.escola_id, calendario.feriados, calendario.recessos, de, ate)
  const regra = {
    frequencia: turma.frequencia,
    intervalo: turma.intervalo ?? 1,
    dias_semana: turma.dias_semana ?? [],
    data_inicio: dia(turma.data_inicio),
    data_fim: dia(turma.data_fim),
  }
  return new Set(datasDaRegra(regra, de, ate).filter((d) => !puladas.has(d)))
}

/**
 * Apaga as aulas futuras sem vínculo que não cabem mais na turma (spec 4.1 e
 * 4.2). Devolve quantas saíram.
 */
export async function limparAulasDaTurma(turmaId: number): Promise<number> {
  const db = clienteAdmin()
  const hoje = agoraNaEscola(new Date()).slice(0, 10)

  const { data: turma } = await db
    .from('turmas')
    .select('id, tipo_recorrencia, data_unica, frequencia, intervalo, dias_semana, data_inicio, data_fim, horario_inicio, escola_id, status')
    .eq('id', turmaId)
    .maybeSingle()
  if (!turma || turma.status !== 'Ativa') return 0

  const { data: aulas } = await db
    .from('aulas')
    .select('id, data_hora_inicio, status')
    .eq('turma_id', turmaId)
    .eq('status', 'Agendada')
    .gte('data_hora_inicio', `${hoje}T00:00:00`)
  if (!aulas || aulas.length === 0) return 0

  const ids = aulas.map((a) => a.id as number)
  const ultima = aulas.map((a) => dia(a.data_hora_inicio)).reduce((a, b) => (b > a ? b : a))

  const [validas, presencas, origem, destino, cobradas, matriculas] = await Promise.all([
    datasValidas(turma as TurmaDaLimpeza, hoje, ultima),
    db.from('presencas').select('aula_id').in('aula_id', ids),
    db.from('pendencias_reposicao').select('aula_origem_id').in('aula_origem_id', ids),
    db.from('pendencias_reposicao').select('aula_reposicao_id').in('aula_reposicao_id', ids),
    db.from('itens_cobranca').select('aula_id').in('aula_id', ids),
    db.from('matriculas').select('data_inicio, data_fim').eq('turma_id', turmaId).eq('status', 'Ativa'),
  ])

  const tocadas = new Set<number>([
    ...(presencas.data ?? []).map((p) => p.aula_id as number),
    ...(origem.data ?? []).map((p) => p.aula_origem_id as number),
    ...(destino.data ?? []).map((p) => p.aula_reposicao_id as number),
    ...(cobradas.data ?? []).map((p) => p.aula_id as number),
  ])
  const mats = (matriculas.data ?? []).map((m) => ({
    data_inicio: dia(m.data_inicio),
    data_fim: m.data_fim ? dia(m.data_fim) : null,
  }))

  const apagar = aulasParaApagar(
    aulas.map((a) => {
      const data = dia(a.data_hora_inicio)
      return {
        id: a.id as number,
        data,
        horario: String(a.data_hora_inicio).slice(11, 16),
        status: a.status,
        vinculada: tocadas.has(a.id as number) || temAlunoNaData(data, mats),
      }
    }),
    validas,
    String(turma.horario_inicio).slice(0, 5),
    hoje,
  )
  if (apagar.length === 0) return 0

  const { error } = await db.from('aulas').delete().in('id', apagar)
  if (error) throw new Error(`Falha ao limpar aulas: ${error.message}`)
  return apagar.length
}

/**
 * Feriado ou recesso cadastrado/alterado (spec 4.1): tira as aulas vazias que
 * caíram nele e refaz as exceções do evento no Google. Recesso só atinge
 * turma com escola. Roda em `after()`: nada aqui pode derrubar o cadastro.
 */
export async function aplicarMudancaDeCalendario(escopo: 'feriado' | 'recesso'): Promise<void> {
  let consulta = clienteAdmin()
    .from('turmas')
    .select('id')
    .eq('status', 'Ativa')
    .eq('tipo_recorrencia', 'Recorrente')
  if (escopo === 'recesso') consulta = consulta.not('escola_id', 'is', null)

  const { data: turmas } = await consulta

  // Uma por vez: o Google limita a taxa de escrita por usuário.
  for (const t of turmas ?? []) {
    try {
      await limparAulasDaTurma(t.id)
      const r = await sincronizarEventoDaTurma(t.id)
      if (!r.ok) console.warn(`evento da turma ${t.id} nao atualizado:`, r.motivo)
    } catch (e) {
      console.error(`falha ao aplicar o ${escopo} na turma ${t.id}:`, e)
    }
  }
}
