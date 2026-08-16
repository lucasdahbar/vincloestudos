import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, type Centavos } from '@/dominio/dinheiro'

/**
 * Resolve valores vigentes por data sem uma viagem ao banco por consulta.
 *
 * As funcoes SQL `valor_servico_em` e `percentual_professor_em` respondem uma
 * data por chamada. Usadas dentro de um laco — uma aula por vez — o fechamento
 * de um mes virava dezenas de idas ao banco em serie, cada uma pagando a
 * latencia inteira.
 *
 * Aqui o historico inteiro vem de uma vez e a resolucao acontece em memoria,
 * com a MESMA regra do SQL: a vigencia que cobre a data, ou a mais antiga
 * cadastrada quando a data e anterior a tudo.
 */
interface Faixa {
  valor: string
  vigencia_inicio: string
  vigencia_fim: string | null
}

function resolver(faixas: Faixa[] | undefined, data: string): string | null {
  if (!faixas || faixas.length === 0) return null

  const cobre = faixas.find(
    (f) => f.vigencia_inicio <= data && (!f.vigencia_fim || f.vigencia_fim >= data),
  )
  if (cobre) return cobre.valor

  // Data anterior a tudo: vale o primeiro valor cadastrado.
  return faixas[faixas.length - 1].valor
}

export interface TabelaDeVigencias {
  valorServico: (servicoId: number, data: string) => Centavos
  percentualProfessor: (professorId: number, data: string) => number
}

export async function carregarVigencias(): Promise<TabelaDeVigencias> {
  const supabase = await clienteServidor()

  const [servicos, professores] = await Promise.all([
    supabase
      .from('servico_valor_historico')
      .select('servico_id, valor, vigencia_inicio, vigencia_fim')
      .order('vigencia_inicio', { ascending: false }),
    supabase
      .from('professor_percentual_historico')
      .select('professor_id, percentual, vigencia_inicio, vigencia_fim')
      .order('vigencia_inicio', { ascending: false }),
  ])

  const porServico = new Map<number, Faixa[]>()
  for (const l of servicos.data ?? []) {
    const faixas = porServico.get(l.servico_id) ?? []
    faixas.push({ valor: String(l.valor), vigencia_inicio: l.vigencia_inicio, vigencia_fim: l.vigencia_fim })
    porServico.set(l.servico_id, faixas)
  }

  const porProfessor = new Map<number, Faixa[]>()
  for (const l of professores.data ?? []) {
    const faixas = porProfessor.get(l.professor_id) ?? []
    faixas.push({
      valor: String(l.percentual),
      vigencia_inicio: l.vigencia_inicio,
      vigencia_fim: l.vigencia_fim,
    })
    porProfessor.set(l.professor_id, faixas)
  }

  return {
    valorServico: (servicoId, data) => deNumeric(resolver(porServico.get(servicoId), data) ?? '0'),
    percentualProfessor: (professorId, data) =>
      Number(resolver(porProfessor.get(professorId), data) ?? 0),
  }
}
