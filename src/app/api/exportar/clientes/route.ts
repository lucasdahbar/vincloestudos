import { exigirGestora } from '@/dados/sessao'
import { planilhaDeClientes } from '@/dados/exportacao'
import { agoraNaEscola } from '@/dominio/agenda/relogio'

export const dynamic = 'force-dynamic'

/**
 * Baixa os responsaveis ativos como .xlsx no modelo do emissor de nota fiscal.
 * So a gestora: a planilha tem CPF e endereco de todas as familias.
 */
export async function GET() {
  await exigirGestora()

  const resultado = await planilhaDeClientes()
  if (!resultado.ok) return new Response(resultado.motivo, { status: 500 })

  return new Response(resultado.arquivo as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="clientes-${agoraNaEscola(new Date()).slice(0, 10)}.xlsx"`,
      // Dado pessoal: nenhum cache intermediario guarda a planilha.
      'Cache-Control': 'no-store',
    },
  })
}
