import { describe, expect, it } from 'vitest'
import { COLUNAS_CLIENTES, linhaDoCliente, type ResponsavelParaExportar } from './planilha-clientes'

const base: ResponsavelParaExportar = {
  nome: 'Mariana Duarte',
  cpf: '123.456.789-09',
  email: 'mariana@email.com',
  telefone: '(21) 99123-4567',
  cep: '22041-001',
  endereco: 'Rua Barata Ribeiro',
  numero: '45',
  complemento: 'Apto 302',
  bairro: 'Copacabana',
  cidade: 'Rio de Janeiro',
  estado: 'RJ',
  observacao: null,
}

function porColuna(linha: string[]) {
  return Object.fromEntries(COLUNAS_CLIENTES.map((c, i) => [c.titulo, linha[i]]))
}

describe('planilha de clientes para a nota fiscal', () => {
  it('segue as 15 colunas do modelo do emissor, na ordem', () => {
    expect(COLUNAS_CLIENTES.map((c) => c.titulo)).toEqual([
      'Nome do cliente / Nome Fantasia *',
      'Razão social',
      'CPF/CNPJ',
      'I.E.',
      'E-mail',
      'Telefone',
      'Celular',
      'CEP',
      'Endereço',
      'Número',
      'Complemento',
      'Bairro',
      'Cidade',
      'Estado',
      'Observações',
    ])
  })

  it('preenche cada coluna com o campo do responsável, mantendo as máscaras', () => {
    expect(porColuna(linhaDoCliente(base))).toEqual({
      'Nome do cliente / Nome Fantasia *': 'Mariana Duarte',
      'Razão social': '',
      'CPF/CNPJ': '123.456.789-09',
      'I.E.': '',
      'E-mail': 'mariana@email.com',
      Telefone: '',
      Celular: '(21) 99123-4567',
      CEP: '22041-001',
      'Endereço': 'Rua Barata Ribeiro',
      'Número': '45',
      Complemento: 'Apto 302',
      Bairro: 'Copacabana',
      Cidade: 'Rio de Janeiro',
      Estado: 'RJ',
      'Observações': '',
    })
  })

  it('telefone fixo (10 dígitos) vai para Telefone, não para Celular', () => {
    const linha = porColuna(linhaDoCliente({ ...base, telefone: '(21) 3333-1010' }))
    expect(linha.Telefone).toBe('(21) 3333-1010')
    expect(linha.Celular).toBe('')
  })

  it('campo vazio no cadastro sai como célula vazia', () => {
    const linha = porColuna(
      linhaDoCliente({ ...base, cpf: null, telefone: null, complemento: '', estado: null }),
    )
    expect(linha['CPF/CNPJ']).toBe('')
    expect(linha.Telefone).toBe('')
    expect(linha.Celular).toBe('')
    expect(linha.Complemento).toBe('')
    expect(linha.Estado).toBe('')
  })

  it('leva a observação do cadastro', () => {
    expect(porColuna(linhaDoCliente({ ...base, observacao: 'Paga em dinheiro' }))['Observações']).toBe(
      'Paga em dinheiro',
    )
  })
})
