/**
 * Catalogo das mensagens que a gestora pode reescrever (03/11/2026).
 *
 * O `padrao` de cada uma e o texto que ja estava no codigo: enquanto ninguem
 * edita, nada muda, e "Restaurar o original" volta para ele. A edicao fica na
 * tabela `mensagens_modelo` (so a chave e o texto).
 *
 * Mensagem com versao para aluno e para responsavel vale por duas entradas:
 * o tom e as informacoes sao diferentes, e um texto so obrigaria a abrir mao
 * de um deles.
 */

export const CHAVES = [
  'boas_vindas_aluno',
  'boas_vindas_responsavel',
  'link_aula_aluno',
  'link_aula_responsavel',
  'presenca_professor',
  'chamada_professor',
  'convite_cadastro',
  'aviso_turma_professor',
] as const

export type ChaveModelo = (typeof CHAVES)[number]

/** O que a gestora editou; chave ausente = vale o texto original. */
export type ModelosEditados = Partial<Record<ChaveModelo, string>>

export type GrupoModelo = 'Famílias e alunos' | 'Professores' | 'Cadastro'

export interface CampoModelo {
  nome: string
  descricao: string
}

export interface DefinicaoModelo {
  grupo: GrupoModelo
  titulo: string
  /** Quando esta mensagem e usada, para a gestora saber qual esta mexendo. */
  quando: string
  campos: CampoModelo[]
  /** Sem estes campos a mensagem perde o sentido (o link, na do link). */
  obrigatorios: string[]
  /** Valores da previa. */
  exemplo: Record<string, string>
  padrao: string
}

const SALA = 'O link da sala chega antes de cada aula.'

export const MODELOS: Record<ChaveModelo, DefinicaoModelo> = {
  boas_vindas_aluno: {
    grupo: 'Famílias e alunos',
    titulo: 'Boas-vindas ao aluno',
    quando: 'Ao matricular um aluno que recebe as mensagens por conta própria.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do aluno' },
      { nome: 'turma', descricao: 'Nome da turma' },
      { nome: 'quando', descricao: 'Dias e horário da turma, como "Terças e quintas, às 15:00"' },
      { nome: 'sala', descricao: 'Aviso do link da sala (só aparece em turma online)' },
    ],
    obrigatorios: [],
    exemplo: {
      nome: 'Ana',
      turma: 'Matemática — 9º ano',
      quando: 'Terças e quintas, às 15:00',
      sala: SALA,
    },
    padrao: [
      'Oi, {nome}! Tudo bem? Boas-vindas à turma de {turma}.',
      '',
      '{quando}.',
      '{sala}',
      '',
      'Boas aulas para você! Um abraço!',
    ].join('\n'),
  },

  boas_vindas_responsavel: {
    grupo: 'Famílias e alunos',
    titulo: 'Boas-vindas ao responsável',
    quando: 'Ao matricular um aluno cujas mensagens vão para o responsável.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do responsável' },
      { nome: 'aluno', descricao: 'Primeiro nome do aluno' },
      { nome: 'turma', descricao: 'Nome da turma' },
      { nome: 'quando', descricao: 'Dias e horário da turma, como "Terças e quintas, às 15:00"' },
      { nome: 'sala', descricao: 'Aviso do link da sala (só aparece em turma online)' },
    ],
    obrigatorios: [],
    exemplo: {
      nome: 'Maria',
      aluno: 'Ana',
      turma: 'Matemática — 9º ano',
      quando: 'Terças e quintas, às 15:00',
      sala: SALA,
    },
    padrao: [
      'Oi, {nome}! Tudo bem? A matrícula de {aluno} na turma abaixo está confirmada.',
      '',
      '{turma}',
      '{quando}.',
      '{sala}',
      '',
      'Qualquer dúvida, só chamar! Um abraço!',
    ].join('\n'),
  },

  link_aula_aluno: {
    grupo: 'Famílias e alunos',
    titulo: 'Link da aula para o aluno',
    quando: 'No botão "Enviar link" da aula online, para o aluno.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do aluno' },
      { nome: 'turma', descricao: 'Nome da turma' },
      { nome: 'quando', descricao: 'Dia e hora da aula, como "Terça-feira, 4 de agosto, às 15:00"' },
      { nome: 'link', descricao: 'Endereço da sala da aula' },
    ],
    obrigatorios: ['link'],
    exemplo: {
      nome: 'Ana',
      turma: 'Matemática — 9º ano',
      quando: 'Terça-feira, 4 de agosto, às 15:00',
      link: 'https://meet.google.com/abc-defg-hij',
    },
    padrao: [
      'Oi, {nome}! Tudo bem? Segue o link para a aula de {turma}.',
      '',
      '{quando}.',
      'Link da sala: {link}',
      '',
      'Boa aula para você! Um abraço!',
    ].join('\n'),
  },

  link_aula_responsavel: {
    grupo: 'Famílias e alunos',
    titulo: 'Link da aula para o responsável',
    quando: 'No botão "Enviar link" da aula online, para o responsável.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do responsável' },
      { nome: 'aluno', descricao: 'Primeiro nome do aluno' },
      { nome: 'turma', descricao: 'Nome da turma' },
      { nome: 'quando', descricao: 'Dia e hora da aula, como "Terça-feira, 4 de agosto, às 15:00"' },
      { nome: 'link', descricao: 'Endereço da sala da aula' },
    ],
    obrigatorios: ['link'],
    exemplo: {
      nome: 'Maria',
      aluno: 'Ana',
      turma: 'Matemática — 9º ano',
      quando: 'Terça-feira, 4 de agosto, às 15:00',
      link: 'https://meet.google.com/abc-defg-hij',
    },
    padrao: [
      'Oi, {nome}! Tudo bem? Segue o link para a aula de {aluno}.',
      '',
      '{turma}',
      '{quando}.',
      'Link da sala: {link}',
      '',
      'Qualquer dúvida, só chamar! Um abraço!',
    ].join('\n'),
  },

  presenca_professor: {
    grupo: 'Professores',
    titulo: 'Link de presença do professor',
    quando: 'No cadastro do professor, ao enviar o link permanente de presença.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do professor' },
      { nome: 'marca', descricao: 'Nome da escola' },
      { nome: 'link', descricao: 'Link pessoal e permanente de presença' },
    ],
    obrigatorios: ['link'],
    exemplo: {
      nome: 'Carlos',
      marca: 'Vinclo Estudos',
      link: 'https://vinclo-estudos.vercel.app/p/professor/exemplo',
    },
    padrao: [
      'Olá, {nome}! Este é o seu link de presença do {marca}:',
      '',
      '{link}',
      '',
      'Ele é sempre o mesmo, para todas as suas turmas — salve no celular. Na hora da aula, é só abrir que ele mostra a turma do momento.',
    ].join('\n'),
  },

  chamada_professor: {
    grupo: 'Professores',
    titulo: 'Link da chamada de uma aula',
    quando: 'Na aula, ao enviar ao professor o link para marcar a presença daquela aula.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do professor' },
      { nome: 'turma', descricao: 'Nome da turma' },
      { nome: 'quando', descricao: 'Dia e hora da aula' },
      { nome: 'link', descricao: 'Link da chamada (vale por 48 horas)' },
    ],
    obrigatorios: ['link'],
    exemplo: {
      nome: 'Carlos',
      turma: 'Matemática — 9º ano',
      quando: 'terça-feira, 4 de agosto, 15:00',
      link: 'https://vinclo-estudos.vercel.app/p/presenca/exemplo',
    },
    padrao: [
      'Olá, {nome}! Segue o link para registrar a presença da aula de {turma}, {quando}:',
      '',
      '{link}',
      '',
      'É só marcar quem veio e tocar em "Confirmar presenças". O link vale por 48 horas.',
    ].join('\n'),
  },

  convite_cadastro: {
    grupo: 'Cadastro',
    titulo: 'Convite de cadastro da família',
    quando: 'Em Novos cadastros, ao gerar o link para uma família preencher os dados.',
    campos: [
      { nome: 'marca', descricao: 'Nome da escola' },
      { nome: 'link', descricao: 'Link do formulário de cadastro' },
      { nome: 'dias', descricao: 'Quantos dias o link vale' },
    ],
    obrigatorios: ['link'],
    exemplo: {
      marca: 'Vinclo Estudos',
      link: 'https://vinclo-estudos.vercel.app/p/cadastro/exemplo',
      dias: '7',
    },
    padrao: [
      'Olá! Para fazer o cadastro na {marca}, é só preencher seus dados e os do aluno neste link:',
      '',
      '{link}',
      '',
      'O link vale por {dias} dias e pode ser usado uma vez.',
    ].join('\n'),
  },

  aviso_turma_professor: {
    grupo: 'Professores',
    titulo: 'Aviso de turma nova ao professor',
    quando: 'Quando uma turma nova é criada, na fila de Mensagens (e-mail do professor).',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do professor' },
      { nome: 'turma', descricao: 'Nome da turma' },
      {
        nome: 'detalhes',
        descricao: 'Matéria, ano escolar, escola e modalidade, uma por linha (o que estiver cadastrado)',
      },
      { nome: 'quando', descricao: 'Dias e horário, já com o rótulo ("Quando: …" ou "Data: …")' },
      { nome: 'videochamada', descricao: 'Linha com o link da videochamada (só se a turma tiver)' },
      { nome: 'presenca', descricao: 'Linha com o link de presença do professor' },
      { nome: 'aviso_presenca', descricao: 'Explicação de que o link de presença é sempre o mesmo' },
    ],
    obrigatorios: [],
    exemplo: {
      nome: 'Carlos',
      turma: 'Matemática — 9º ano',
      detalhes: 'Matéria: Matemática\nAno escolar: 9º ano\nModalidade: Online',
      quando: 'Quando: terças e quintas, das 15:00 às 16:00',
      videochamada: 'Link da videochamada: https://meet.google.com/abc-defg-hij',
      presenca: 'Seu link de presença: https://vinclo-estudos.vercel.app/p/professor/exemplo',
      aviso_presenca:
        'Esse link de presença é sempre o mesmo, para todas as suas turmas: guarde no celular. Ao abrir, ele mostra a aula do momento.',
    },
    padrao: [
      'Olá, {nome}!',
      '',
      'Você foi designado para a turma {turma}.',
      '',
      '{detalhes}',
      '{quando}',
      '',
      '{videochamada}',
      '{presenca}',
      '{aviso_presenca}',
      '',
      'Qualquer dúvida, é só chamar.',
    ].join('\n'),
  },
}

/**
 * O texto que vale hoje: a edicao da gestora, ou o original. Edicao em branco
 * nao conta (a tela nem deixa salvar, mas o banco nao e a unica porta).
 */
export function textoDoModelo(chave: ChaveModelo, editados?: ModelosEditados): string {
  const editado = editados?.[chave]
  return editado && editado.trim() !== '' ? editado : MODELOS[chave].padrao
}

export function ehChaveDeModelo(valor: string): valor is ChaveModelo {
  return (CHAVES as readonly string[]).includes(valor)
}
