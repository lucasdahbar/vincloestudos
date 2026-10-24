import 'server-only'
import { clienteServidor } from './cliente'
import {
  COLUNAS_CLIENTES,
  linhaDoCliente,
  type ResponsavelParaExportar,
} from '@/dominio/exportacao/planilha-clientes'
import { gerarXlsx } from '@/dominio/exportacao/xlsx'

// O PostgREST corta cada resposta em 1000 linhas; a busca vai em paginas para
// a planilha nunca sair incompleta sem aviso.
const PAGINA = 1000

/**
 * Planilha dos responsaveis ativos no modelo do emissor de nota fiscal
 * (pedido do Julio, 24/10/2026). Responsavel inativo saiu da escola e nao
 * recebe nota nova.
 */
export async function planilhaDeClientes(): Promise<
  { ok: true; arquivo: Uint8Array; total: number } | { ok: false; motivo: string }
> {
  const supabase = await clienteServidor()
  const responsaveis: ResponsavelParaExportar[] = []

  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('responsaveis')
      .select('nome, cpf, email, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, observacao')
      .eq('ativo', true)
      .order('nome')
      .order('id')
      .range(inicio, inicio + PAGINA - 1)
    if (error) {
      console.error('falha ao exportar responsaveis:', error.message)
      return { ok: false, motivo: 'Não foi possível ler os responsáveis.' }
    }
    responsaveis.push(...data)
    if (data.length < PAGINA) break
  }

  const arquivo = gerarXlsx({
    aba: 'Clientes',
    colunas: COLUNAS_CLIENTES,
    linhas: responsaveis.map(linhaDoCliente),
  })
  return { ok: true, arquivo, total: responsaveis.length }
}
