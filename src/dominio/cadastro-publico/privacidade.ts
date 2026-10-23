/**
 * Textos de LGPD do formulario publico (pedido do Julio, 18/10/2026): embaixo
 * de cada campo aparece por que a escola precisa dele. Ficam juntos aqui para
 * a revisao do texto ser feita num lugar so.
 *
 * A LGPD (Art. 9) pede que o titular saiba quem trata os dados, para que, e
 * como pedir correcao ou exclusao. A escola nao tem CNPJ cadastrado no
 * sistema; quando tiver, entra em `marca.ts` e aparece no aviso.
 */
import { EMAIL_DE_CONTATO, RAZAO_SOCIAL } from '@/marca'

const NOTA_FISCAL = 'Necessário para a emissão da nota fiscal.'

export const MOTIVO_DO_CAMPO = {
  responsavel: {
    nome: NOTA_FISCAL,
    cpf: NOTA_FISCAL,
    cep: `${NOTA_FISCAL} O endereço é preenchido a partir dele.`,
    numero: NOTA_FISCAL,
    telefone: `${NOTA_FISCAL} Também usamos para enviar avisos e os links das aulas pelo WhatsApp.`,
    email: `${NOTA_FISCAL} Também usamos para enviar avisos e os links das aulas.`,
  },
  aluno: {
    nome: 'Para identificar o aluno nas turmas e nas aulas.',
    recebe_links: 'Os links das aulas e os avisos vão para quem você escolher.',
    contato: 'Telefone ou e-mail do aluno, para ele receber os links das aulas.',
    data_nascimento: 'Opcional. Ajuda a escola a montar as turmas.',
    escola: 'Opcional. Ajuda a escola a montar as turmas. Se não estiver na lista, deixe em branco.',
  },
} as const

// Texto do Julio, 22/10/2026.
export const AVISO_DE_PRIVACIDADE = [
  `Os dados coletados neste formulário são armazenados pela ${RAZAO_SOCIAL} e ` +
    'utilizados exclusivamente para cadastro, emissão de notas fiscais e envio de ' +
    'avisos e links das aulas. Eles não serão vendidos nem compartilhados com ' +
    'terceiros para outras finalidades.',
  'Caso precise corrigir ou excluir seus dados ou os do(a) aluno(a), entre em ' +
    `contato pelo e-mail: ${EMAIL_DE_CONTATO}.`,
]

export const TEXTO_DO_ACEITE =
  'Li e concordo com os termos acima, autorizando o uso dos meus dados e dos ' +
  'dados do(a) aluno(a) para as finalidades descritas.'
