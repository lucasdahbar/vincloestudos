import { baseDoRelatorioFinanceiro } from '@/dados/relatorio-financeiro'
import { exigirGestora } from '@/dados/sessao'
import { filtrarLinhas, paraCsv } from '@/dominio/relatorios/financeiro'
import { filtrosDaUrl, mesDaUrl } from '../filtros'

/** Baixa as aulas do relatorio, com os filtros da tela, para abrir no Excel. */
export async function GET(request: Request) {
  await exigirGestora()
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const mes = mesDaUrl(params)

  const { linhas } = await baseDoRelatorioFinanceiro(mes)
  const csv = paraCsv(filtrarLinhas(linhas, filtrosDaUrl(params)))

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="relatorio-financeiro-${mes}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
