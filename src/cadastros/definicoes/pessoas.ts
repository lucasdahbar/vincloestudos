import { z } from 'zod'
import { defineCadastro } from '@/cadastros/tipos'
import { CANAIS_NOTIFICACAO, DESTINATARIOS_NOTIFICACAO } from '@/dominio/tipos'

const nome = z.string().trim().min(1, 'Informe o nome.')
const opcional = z.string().nullable()

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
    { nome: 'telefone', etiqueta: 'Telefone', tipo: 'texto', schema: opcional, naLista: true },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: opcional, buscavel: true },
    { nome: 'cpf', etiqueta: 'CPF', tipo: 'texto', schema: opcional },
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
      tipo: 'texto',
      ajuda: 'Número usado para enviar cobranças e avisos.',
      schema: opcional,
      naLista: true,
      buscavel: true,
    },
    { nome: 'email', etiqueta: 'E-mail', tipo: 'texto', schema: opcional, buscavel: true },
    { nome: 'cpf', etiqueta: 'CPF', tipo: 'texto', schema: opcional },
    { nome: 'endereco', etiqueta: 'Endereço', tipo: 'texto', schema: opcional },
    {
      nome: 'cidade_id',
      etiqueta: 'Cidade',
      tipo: 'referencia',
      referencia: { tabela: 'cidades', rotulo: 'nome', rota: 'cidades' },
      schema: z.number().int().nullable(),
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
