import { z } from 'zod'
import { defineCadastro } from '@/cadastros/tipos'
import { ABRANGENCIAS_FERIADO, TIPOS_CONTA } from '@/dominio/tipos'

const textoObrigatorio = (rotulo: string) =>
  z.string().trim().min(1, `Informe ${rotulo}.`)

export const materias = defineCadastro({
  tabela: 'materias',
  rota: 'materias',
  rotulo: { singular: 'Matéria', plural: 'Matérias', genero: 'f' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre as matérias que sua equipe ensina, como Matemática ou Português.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome da matéria',
      tipo: 'texto',
      schema: textoObrigatorio('o nome da matéria'),
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    { nome: 'ativo', etiqueta: 'Ativa', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const anosEscolares = defineCadastro({
  tabela: 'anos_escolares',
  rota: 'anos-escolares',
  rotulo: { singular: 'Ano escolar', plural: 'Anos escolares', genero: 'm' },
  ordenacao: { coluna: 'ordem' },
  dicaVazio: 'Cadastre os anos escolares atendidos, como "9º ano — Fundamental".',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: textoObrigatorio('o nome do ano escolar'),
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'ordem',
      etiqueta: 'Ordem de exibição',
      tipo: 'numero',
      ajuda: 'Define a sequência nas listas. O 1º ano vem antes do 9º.',
      schema: z.number().int().min(0),
      obrigatorio: true,
      padrao: 0,
      naLista: true,
    },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const contas = defineCadastro({
  tabela: 'contas',
  rota: 'contas',
  rotulo: { singular: 'Conta', plural: 'Contas', genero: 'f' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre onde o dinheiro entra e sai: conta do banco, Pix, dinheiro em espécie.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome da conta',
      tipo: 'texto',
      schema: textoObrigatorio('o nome da conta'),
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'tipo',
      etiqueta: 'Tipo',
      tipo: 'selecao',
      opcoes: TIPOS_CONTA,
      schema: z.enum(TIPOS_CONTA),
      obrigatorio: true,
      padrao: 'Banco',
      naLista: true,
    },
    { nome: 'banco', etiqueta: 'Banco', tipo: 'texto', schema: z.string().nullable() },
    {
      nome: 'chave_pix',
      etiqueta: 'Chave Pix',
      tipo: 'texto',
      ajuda: 'Aparece no texto de cobrança enviado aos responsáveis.',
      schema: z.string().nullable(),
    },
    { nome: 'ativo', etiqueta: 'Ativa', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const feriados = defineCadastro({
  tabela: 'feriados',
  rota: 'feriados',
  rotulo: { singular: 'Feriado', plural: 'Feriados', genero: 'm' },
  ordenacao: { coluna: 'data' },
  dicaVazio:
    'Cadastre os feriados para o sistema avisar quando uma aula cair em um deles.',
  campos: [
    {
      nome: 'data',
      etiqueta: 'Data',
      tipo: 'data',
      schema: z.string().min(1, 'Informe a data.'),
      obrigatorio: true,
      naLista: true,
    },
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: textoObrigatorio('o nome do feriado'),
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'abrangencia',
      etiqueta: 'Abrangência',
      tipo: 'selecao',
      opcoes: ABRANGENCIAS_FERIADO,
      schema: z.enum(ABRANGENCIAS_FERIADO),
      obrigatorio: true,
      padrao: 'Nacional',
      naLista: true,
    },
  ],
})

export const escolas = defineCadastro({
  tabela: 'escolas',
  rota: 'escolas',
  rotulo: { singular: 'Escola', plural: 'Escolas', genero: 'f' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre as escolas dos seus alunos.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome da escola',
      tipo: 'texto',
      schema: textoObrigatorio('o nome da escola'),
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'cep',
      etiqueta: 'CEP',
      tipo: 'cep',
      ajuda: 'Ao sair do campo, o endereço é preenchido sozinho.',
      schema: z.string().nullable(),
    },
    { nome: 'endereco', etiqueta: 'Logradouro', tipo: 'texto', schema: z.string().nullable() },
    { nome: 'numero', etiqueta: 'Número', tipo: 'texto', schema: z.string().nullable() },
    {
      nome: 'complemento',
      etiqueta: 'Complemento',
      tipo: 'texto',
      ajuda: 'Ex.: Apto 301, Sala 2.',
      schema: z.string().nullable(),
    },
    { nome: 'bairro', etiqueta: 'Bairro', tipo: 'texto', schema: z.string().nullable() },
    { nome: 'cidade', etiqueta: 'Cidade', tipo: 'texto', schema: z.string().nullable(), naLista: true },
    {
      nome: 'estado',
      etiqueta: 'Estado (UF)',
      tipo: 'texto',
      schema: z
        .string()
        .nullable()
        .refine(
          (v) => v === null || v.trim() === '' || /^[A-Za-z]{2}$/.test(v.trim()),
          'Use a sigla de 2 letras, como MG.',
        ),
    },
    { nome: 'telefone', etiqueta: 'Telefone', tipo: 'telefone', schema: z.string().nullable() },
    { nome: 'ativo', etiqueta: 'Ativa', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const servicos = defineCadastro({
  tabela: 'servicos',
  rota: 'servicos',
  rotulo: { singular: 'Serviço', plural: 'Serviços', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio:
    'Cadastre o que você vende: aula regular, aulão de revisão, aula particular.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome do serviço',
      tipo: 'texto',
      schema: textoObrigatorio('o nome do serviço'),
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'descricao',
      etiqueta: 'Descrição',
      tipo: 'texto-longo',
      schema: z.string().nullable(),
    },
    {
      nome: 'valor_padrao',
      etiqueta: 'Valor por aula',
      tipo: 'dinheiro',
      ajuda: 'Usado nas cobranças e no cálculo do repasse ao professor.',
      schema: z.string().min(1, 'Informe o valor por aula.'),
      obrigatorio: true,
      naLista: true,
    },
    {
      nome: 'permite_materia',
      etiqueta: 'Este serviço tem matéria',
      tipo: 'booleano',
      ajuda: 'Marque se as turmas deste serviço precisam indicar a matéria ensinada.',
      schema: z.boolean(),
      padrao: true,
    },
    {
      nome: 'permite_escola',
      etiqueta: 'Este serviço tem escola',
      tipo: 'booleano',
      ajuda: 'Marque se as turmas deste serviço são ligadas a uma escola específica.',
      schema: z.boolean(),
      padrao: true,
    },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})
