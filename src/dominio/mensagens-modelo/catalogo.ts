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
  'cobranca_abertura',
  'cobranca_abertura_complementar',
  'cobranca_rodape',
  'relatorio_professor_abertura',
  'relatorio_professor_rodape',
] as const

export type ChaveModelo = (typeof CHAVES)[number]

/** O que a gestora editou; chave ausente = vale o texto original. */
export type ModelosEditados = Partial<Record<ChaveModelo, string>>

export type GrupoModelo = 'Famílias e alunos' | 'Professores' | 'Cadastro' | 'Cobrança e pagamento'

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

  // Cobranca e relatorio: so o comeco e o fim. O meio (aluno a aluno, os
  // pontinhos alinhados, itens iguais resumidos) e montado pelo sistema, porque
  // texto livre quebraria o alinhamento dos valores no WhatsApp.
  cobranca_abertura: {
    grupo: 'Cobrança e pagamento',
    titulo: 'Cobrança: começo do texto',
    quando: 'Primeira linha da cobrança do mês, antes da lista de alunos e valores.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do responsável' },
      { nome: 'mes', descricao: 'Mês da cobrança, como "agosto/2026"' },
    ],
    obrigatorios: [],
    exemplo: { nome: 'Maria', mes: 'agosto/2026' },
    padrao: 'Olá, {nome}! Segue a cobrança referente a {mes}:',
  },

  cobranca_abertura_complementar: {
    grupo: 'Cobrança e pagamento',
    titulo: 'Cobrança complementar: começo do texto',
    quando:
      'Primeira linha de uma cobrança adicional de um mês que já teve outra. Precisa dizer que é complementar, senão o responsável lê como a mesma cobrança de novo.',
    campos: [
      { nome: 'nome', descricao: 'Primeiro nome do responsável' },
      { nome: 'mes', descricao: 'Mês da cobrança, como "agosto/2026"' },
    ],
    obrigatorios: [],
    exemplo: { nome: 'Maria', mes: 'agosto/2026' },
    padrao:
      'Olá, {nome}! Segue uma cobrança complementar — {mes}, referente a aulas que não entraram na cobrança anterior:',
  },

  cobranca_rodape: {
    grupo: 'Cobrança e pagamento',
    titulo: 'Cobrança: final do texto',
    quando: 'Depois da lista de alunos: o total, o Pix e o vencimento (e o que mais você quiser escrever).',
    campos: [
      { nome: 'total', descricao: 'Valor total já com descontos, como "R$ 905,00"' },
      { nome: 'vencimento', descricao: 'Data de vencimento, como "05/08/2026"' },
      {
        nome: 'pix',
        descricao:
          'A chave Pix já com o rótulo e o traço ("Pix: chave — "); fica vazio se a conta não tiver chave',
      },
      { nome: 'chave_pix', descricao: 'Só a chave Pix, sem rótulo (vazio se a conta não tiver)' },
    ],
    obrigatorios: ['total', 'vencimento'],
    exemplo: {
      total: 'R$ 905,00',
      vencimento: '05/08/2026',
      pix: 'Pix: escola@email.com — ',
      chave_pix: 'escola@email.com',
    },
    padrao: 'TOTAL: {total}\n\n{pix}Vencimento: {vencimento}',
  },

  relatorio_professor_abertura: {
    grupo: 'Cobrança e pagamento',
    titulo: 'Relatório do professor: começo do texto',
    quando: 'Início do relatório de fechamento enviado ao professor, antes da lista de aulas.',
    campos: [
      { nome: 'professor', descricao: 'Nome do professor' },
      { nome: 'ate', descricao: 'Data final do período, como "31/08/2026"' },
    ],
    obrigatorios: [],
    exemplo: { professor: 'Carlos Souza', ate: '31/08/2026' },
    padrao: 'Fechamento — {professor}\nPeríodo: até {ate}',
  },

  relatorio_professor_rodape: {
    grupo: 'Cobrança e pagamento',
    titulo: 'Relatório do professor: final do texto',
    quando: 'Fim do relatório de fechamento, depois da lista de aulas.',
    campos: [
      { nome: 'total', descricao: 'Valor total a pagar ao professor, como "R$ 1.260,00"' },
      { nome: 'quantidade', descricao: 'Quantas presenças entraram no fechamento' },
      { nome: 'presencas', descricao: 'A palavra "presença" ou "presenças", conforme a quantidade' },
      { nome: 'professor', descricao: 'Nome do professor' },
    ],
    obrigatorios: ['total'],
    exemplo: { total: 'R$ 1.260,00', quantidade: '20', presencas: 'presenças', professor: 'Carlos Souza' },
    padrao: 'TOTAL: {total} ({quantidade} {presencas})',
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
