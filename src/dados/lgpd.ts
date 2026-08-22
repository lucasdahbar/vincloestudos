import 'server-only'
import { clienteServidor } from './cliente'
import {
  camposAnonimizados,
  decidirExclusao,
  type Decisao,
  type Entidade,
} from '@/dominio/lgpd/exclusao'

/**
 * Onde procurar vinculos de cada pessoa. Financeiro e operacional sao contados
 * separado porque a mensagem para a gestora muda: "ha cobranca vinculada" pesa
 * diferente de "ha aula registrada".
 */
const VINCULOS: Record<Entidade, { financeiros: [string, string][]; operacionais: [string, string][] }> = {
  professores: {
    financeiros: [['contas_pagar_professor', 'professor_id']],
    operacionais: [
      ['turmas', 'professor_id'],
      ['presencas', 'registrado_por'],
    ],
  },
  responsaveis: {
    financeiros: [['cobrancas', 'responsavel_id']],
    operacionais: [['alunos', 'responsavel_id']],
  },
  alunos: {
    financeiros: [['itens_cobranca', 'aluno_id']],
    operacionais: [
      ['matriculas', 'aluno_id'],
      ['presencas', 'aluno_id'],
      ['pendencias_reposicao', 'aluno_id'],
    ],
  },
}

async function contar(tabela: string, coluna: string, id: number): Promise<number> {
  const supabase = await clienteServidor()
  const { count } = await supabase
    .from(tabela)
    .select('*', { count: 'exact', head: true })
    .eq(coluna, id)
  return count ?? 0
}

/** O que vai acontecer se a gestora mandar excluir — mostrado ANTES de agir. */
export async function previaExclusao(entidade: Entidade, id: number): Promise<Decisao> {
  const mapa = VINCULOS[entidade]
  const [fin, ope] = await Promise.all([
    Promise.all(mapa.financeiros.map(([t, c]) => contar(t, c, id))),
    Promise.all(mapa.operacionais.map(([t, c]) => contar(t, c, id))),
  ])

  return decidirExclusao({
    financeiros: fin.reduce((s, n) => s + n, 0),
    operacionais: ope.reduce((s, n) => s + n, 0),
  })
}

export async function executarExclusao(
  entidade: Entidade,
  id: number,
  usuario: string,
): Promise<{ ok: boolean; acao?: 'excluir' | 'anonimizar'; erro?: string }> {
  const supabase = await clienteServidor()
  const decisao = await previaExclusao(entidade, id)

  if (decisao.acao === 'excluir') {
    const { error } = await supabase.from(entidade).delete().eq('id', id)
    // Uma FK que o mapa nao previu ainda pode barrar: nesse caso anonimiza,
    // que preserva o vinculo e cumpre a LGPD do mesmo jeito.
    if (error) {
      const { error: erroAnon } = await supabase
        .from(entidade)
        .update(camposAnonimizados(entidade, id))
        .eq('id', id)
      if (erroAnon) return { ok: false, erro: erroAnon.message }
      await registrar(entidade, id, 'anonimizar', usuario)
      return { ok: true, acao: 'anonimizar' }
    }
    await registrar(entidade, id, 'excluir', usuario)
    return { ok: true, acao: 'excluir' }
  }

  const { error } = await supabase
    .from(entidade)
    .update(camposAnonimizados(entidade, id))
    .eq('id', id)

  if (error) return { ok: false, erro: error.message }
  await registrar(entidade, id, 'anonimizar', usuario)
  return { ok: true, acao: 'anonimizar' }
}

/** Exclusao e anonimizacao ficam no log: e exigencia de prestacao de contas. */
async function registrar(entidade: string, id: number, acao: string, usuario: string) {
  const supabase = await clienteServidor()
  await supabase.from('logs_operacionais').insert({
    acao: `lgpd_${acao}`,
    entidade,
    entidade_id: id,
    usuario,
    detalhe: { base_legal: 'LGPD Art. 18 — direito ao esquecimento' },
  })
}
