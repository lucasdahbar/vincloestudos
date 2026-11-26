import { comoId, comoOpcao, comoTexto } from '@/dominio/filtros'
import { SITUACOES, type FiltrosFinanceiros } from '@/dominio/relatorios/financeiro'

type Parametros = Record<string, string | string[] | undefined>

/** Os filtros da URL. A tela e a exportacao leem daqui, para o arquivo ser o que esta na tela. */
export function filtrosDaUrl(params: Parametros): FiltrosFinanceiros {
  return {
    responsavel_id: comoId(params.responsavel),
    aluno_id: comoId(params.aluno),
    professor_id: comoId(params.professor),
    materia: comoTexto(params.materia),
    ano_escolar: comoTexto(params.ano),
    escola: comoTexto(params.escola),
    turma: comoTexto(params.turma),
    servico: comoTexto(params.servico),
    situacao: comoOpcao(params.status, SITUACOES),
  }
}

/** O mes da URL (AAAA-MM), ou o mes atual no fuso da escola. */
export function mesDaUrl(params: Parametros): string {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  const pedido = comoTexto(params.mes)
  return pedido && /^\d{4}-\d{2}$/.test(pedido) ? pedido : hoje
}
