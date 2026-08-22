import { z } from 'zod'
import { defineCadastro } from '@/cadastros/tipos'
import { cpfValido } from '@/dominio/documentos/formato'
import { CANAIS_NOTIFICACAO, DESTINATARIOS_NOTIFICACAO } from '@/dominio/tipos'

const nome = z.string().trim().min(1, 'Informe o nome.')
const opcional = z.string().nullable()

/** Campo opcional, mas se preenchido tem que ser valido (Secoes 4.3 e 5.3). */
const cpfOpcional = z
  .string()
  .nullable()
  .refine((v) => !v || v.trim() === '' || cpfValido(v), 'CPF inválido')

const emailOpcional = z
  .string()
  .nullable()
  .refine(
    (v) => !v || v.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
    'E-mail inválido',
  )

export const professores = defineCadastro({
  tabela: 'professores',
  rota: 'professores',
  rotulo: { singular: 'Professor', plural: 'Professores', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre os professores que dão as aulas.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: nome,
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'percentual_repasse',
      etiqueta: 'Percentual de repasse (%)',
      tipo: 'percentual',
      ajuda:
        'Quanto o professor recebe por aula, em porcentagem do valor do serviço. Ex.: 60. Alterar aqui não muda pagamentos já fechados.',
      schema: z
        .string()
        .min(1, 'Informe o percentual.')
        .refine((v) => {
          const n = Number(v.replace(',', '.'))
          return Number.isFinite(n) && n >= 0 && n <= 100
        }, 'Use um número entre 0 e 100.'),
      obrigatorio: true,
      naLista: true,
    },
    { nome: 'telefone', etiqueta: 'Telefone', tipo: 'telefone', schema: opcional, naLista: true },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: emailOpcional, buscavel: true },
    { nome: 'cpf', etiqueta: 'CPF', tipo: 'cpf', schema: cpfOpcional },
    {
      nome: 'chave_pix',
      etiqueta: 'Chave Pix',
      tipo: 'texto',
      ajuda: 'Para onde o pagamento do professor é enviado.',
      schema: opcional,
    },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const responsaveis = defineCadastro({
  tabela: 'responsaveis',
  rota: 'responsaveis',
  rotulo: { singular: 'Responsável', plural: 'Responsáveis', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio: 'Cadastre os pais e responsáveis. É para eles que as cobranças são emitidas.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: nome,
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'telefone',
      etiqueta: 'Telefone (WhatsApp)',
      tipo: 'telefone',
      ajuda: 'Número usado para enviar cobranças e avisos.',
      schema: opcional,
      naLista: true,
      buscavel: true,
    },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: opcional, buscavel: true },
    { nome: 'cpf', etiqueta: 'CPF', tipo: 'cpf', schema: cpfOpcional },
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
    { nome: 'observacao', etiqueta: 'Observações', tipo: 'texto-longo', schema: opcional },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})

export const alunos = defineCadastro({
  tabela: 'alunos',
  rota: 'alunos',
  rotulo: { singular: 'Aluno', plural: 'Alunos', genero: 'm' },
  ordenacao: { coluna: 'nome' },
  dicaVazio:
    'Cadastre os alunos. Cada aluno precisa de um responsável cadastrado antes.',
  campos: [
    {
      nome: 'nome',
      etiqueta: 'Nome',
      tipo: 'texto',
      schema: nome,
      obrigatorio: true,
      naLista: true,
      buscavel: true,
    },
    {
      nome: 'responsavel_id',
      etiqueta: 'Responsável',
      tipo: 'referencia',
      ajuda: 'Quem recebe e paga as cobranças deste aluno.',
      referencia: { tabela: 'responsaveis', rotulo: 'nome', rota: 'responsaveis' },
      schema: z.number({ message: 'Selecione o responsável.' }).int(),
      obrigatorio: true,
      naLista: true,
    },
    {
      nome: 'escola_id',
      etiqueta: 'Escola',
      tipo: 'referencia',
      referencia: { tabela: 'escolas', rotulo: 'nome', rota: 'escolas' },
      schema: z.number().int().nullable(),
      naLista: true,
    },
    { nome: 'data_nascimento', etiqueta: 'Data de nascimento', tipo: 'data', schema: opcional },
    { nome: 'telefone', etiqueta: 'Telefone', tipo: 'texto', schema: opcional },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: opcional, buscavel: true },
    {
      nome: 'destinatario_notificacao',
      etiqueta: 'Quem recebe os avisos',
      tipo: 'selecao',
      ajuda: 'Para quem enviar o link das aulas online e as boas-vindas.',
      opcoes: DESTINATARIOS_NOTIFICACAO,
      schema: z.enum(DESTINATARIOS_NOTIFICACAO),
      obrigatorio: true,
      padrao: 'Responsável',
    },
    {
      nome: 'canal_notificacao',
      etiqueta: 'Por onde avisar',
      tipo: 'selecao',
      opcoes: CANAIS_NOTIFICACAO,
      schema: z.enum(CANAIS_NOTIFICACAO),
      obrigatorio: true,
      padrao: 'WhatsApp',
    },
    { nome: 'observacao', etiqueta: 'Observações', tipo: 'texto-longo', schema: opcional },
    { nome: 'ativo', etiqueta: 'Ativo', tipo: 'booleano', schema: z.boolean(), padrao: true },
  ],
})
