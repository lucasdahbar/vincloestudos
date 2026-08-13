import { deNumeric, formatarBRL } from '@/dominio/dinheiro'
import type { CampoCliente } from '@/cadastros/tipos'

const VAZIO = '—'

export function formatarCelula(
  campo: CampoCliente,
  valor: unknown,
  registro: Record<string, unknown>,
): string {
  if (campo.tipo === 'booleano') return valor ? 'Sim' : 'Não'

  if (campo.tipo === 'referencia') {
    const juncao = registro[`${campo.nome}_ref`] as Record<string, unknown> | null | undefined
    const rotulo = juncao?.[campo.referencia?.rotulo ?? 'nome']
    return rotulo ? String(rotulo) : VAZIO
  }

  if (valor === null || valor === undefined || valor === '') return VAZIO

  if (campo.tipo === 'dinheiro') return formatarBRL(deNumeric(String(valor)))

  if (campo.tipo === 'percentual') {
    const numero = Number(String(valor))
    return `${numero.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  }

  if (campo.tipo === 'data') {
    const [ano, mes, dia] = String(valor).slice(0, 10).split('-')
    return `${dia}/${mes}/${ano}`
  }

  return String(valor)
}
