/**
 * Exportacao dos responsaveis para o emissor de nota fiscal (pedido do Julio,
 * 24/10/2026). O cliente da nota e o responsavel, que e quem paga.
 *
 * As colunas e a ordem copiam o modelo de importacao do emissor
 * (requisitos/Importacao_Modelo_Clientes.xlsx); o titulo tem de bater letra por letra,
 * porque e por ele que o emissor reconhece cada coluna. Razao social e I.E.
 * so existem para empresa e ficam vazias.
 */
import type { ColunaXlsx } from './xlsx'

export interface ResponsavelParaExportar {
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  observacao: string | null
}

type Campo = (r: ResponsavelParaExportar) => string | null

// O sistema guarda um telefone so. Com 11 digitos (DDD + 9) e celular; com 10,
// fixo. O modelo do emissor separa os dois.
const digitos = (t: string | null) => (t ?? '').replace(/\D/g, '').length
const celular: Campo = (r) => (digitos(r.telefone) === 11 ? r.telefone : null)
const fixo: Campo = (r) => (digitos(r.telefone) === 10 ? r.telefone : null)
const vazio: Campo = () => null

// Larguras tiradas do modelo.
export const COLUNAS_CLIENTES: (ColunaXlsx & { valor: Campo })[] = [
  { titulo: 'Nome do cliente / Nome Fantasia *', largura: 40, valor: (r) => r.nome },
  { titulo: 'Razão social', largura: 25, valor: vazio },
  { titulo: 'CPF/CNPJ', largura: 22, valor: (r) => r.cpf },
  { titulo: 'I.E.', largura: 16, valor: vazio },
  { titulo: 'E-mail', largura: 30, valor: (r) => r.email },
  { titulo: 'Telefone', largura: 18, valor: fixo },
  { titulo: 'Celular', largura: 19, valor: celular },
  { titulo: 'CEP', largura: 12, valor: (r) => r.cep },
  { titulo: 'Endereço', largura: 30, valor: (r) => r.endereco },
  { titulo: 'Número', largura: 9, valor: (r) => r.numero },
  { titulo: 'Complemento', largura: 16, valor: (r) => r.complemento },
  { titulo: 'Bairro', largura: 18, valor: (r) => r.bairro },
  { titulo: 'Cidade', largura: 18, valor: (r) => r.cidade },
  { titulo: 'Estado', largura: 8, valor: (r) => r.estado },
  { titulo: 'Observações', largura: 34, valor: (r) => r.observacao },
]

export function linhaDoCliente(r: ResponsavelParaExportar): string[] {
  return COLUNAS_CLIENTES.map((c) => (c.valor(r) ?? '').trim())
}
