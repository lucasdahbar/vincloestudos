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
async function datasValidas(turma: TurmaDaLimpeza, de: string, ate: string): Promise<Set<string> | null> {
  if (turma.tipo_recorrencia === 'Único') {
    return new Set(turma.data_unica ? [dia(turma.data_unica)] : [])
  }
  // Regra incompleta: não dá para dizer o que é válido, então não se apaga nada.
  if (!turma.frequencia || !turma.data_inicio || !turma.data_fim) return null

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
  const agora = agoraNaEscola(new Date())
  const hoje = agora.slice(0, 10)

  const { data: turma, error: erroTurma } = await db
    .from('turmas')
    .select('id, tipo_recorrencia, data_unica, frequencia, intervalo, dias_semana, data_inicio, data_fim, horario_inicio, escola_id, status')
    .eq('id', turmaId)
    .maybeSingle()
  if (erroTurma) throw new Error(`Falha ao conferir as aulas da turma: ${erroTurma.message}`)
  if (!turma || turma.status !== 'Ativa') return 0

  const { data: aulas, error: erroAulas } = await db
    .from('aulas')
    .select('id, data_hora_inicio, status')
    .eq('turma_id', turmaId)
    .eq('status', 'Agendada')
    .gte('data_hora_inicio', agora)
  if (erroAulas) throw new Error(`Falha ao conferir as aulas da turma: ${erroAulas.message}`)
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

  for (const r of [presencas, origem, destino, cobradas, matriculas]) {
    if (r.error) throw new Error(`Falha ao conferir as aulas da turma: ${r.error.message}`)
  }
  if (!validas) return 0

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

export type MudancaDeCalendario = { de: string; ate: string; escolaId: number | null }

/**
 * Feriado ou recesso cadastrado/alterado (spec 4.1): tira as aulas vazias que
 * caíram nele e refaz as exceções do evento no Google. Só mexe nas turmas
 * recorrentes ativas cujo período toca a mudança (`escolaId` nulo = feriado,
 * vale para todas; com escola = recesso dela). Roda em `after()`: nada aqui
 * pode derrubar o cadastro.
 */
export async function aplicarMudancaDeCalendario(mudancas: MudancaDeCalendario[]): Promise<void> {
  if (mudancas.length === 0) return

  const { data, error } = await clienteAdmin()
    .from('turmas')
    .select('id, escola_id, data_inicio, data_fim')
    .eq('status', 'Ativa')
    .eq('tipo_recorrencia', 'Recorrente')
  if (error) {
    console.error('falha ao buscar as turmas afetadas pelo calendario:', error.message)
    return
  }

  const afetadas = (data ?? []).filter((t) => {
    if (!t.data_inicio || !t.data_fim) return false
    const ini = dia(t.data_inicio)
    const fim = dia(t.data_fim)
    return mudancas.some(
      (m) => ini <= m.ate && fim >= m.de && (m.escolaId === null || t.escola_id === m.escolaId),
    )
  })

  // Uma por vez: o Google limita a taxa de escrita por usuário.
  for (const t of afetadas) {
    try {
      await limparAulasDaTurma(t.id)
      const r = await sincronizarEventoDaTurma(t.id)
      if (!r.ok) console.warn(`evento da turma ${t.id} nao atualizado:`, r.motivo)
    } catch (e) {
      console.error(`falha ao aplicar a mudanca de calendario na turma ${t.id}:`, e)
    }
  }
}
