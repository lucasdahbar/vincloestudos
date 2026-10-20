/**
 * Validacao do formulario publico de cadastro (pedido do Julio, 17/10/2026).
 *
 * O formulario e mais exigente que a tela da gestora: la quase tudo e
 * opcional, porque a Kelly cadastra por telefone e completa depois. Aqui o
 * responsavel preenche sozinho, e o que ele nao preencher a escola teria de
 * correr atras. Campos obrigatorios decididos pelo Julio em 18/10/2026:
 * - responsavel: nome, telefone, e-mail, CPF, CEP e numero (o resto do
 *   endereco vem do CEP);
 * - aluno: nome, e telefone ou e-mail para receber os links das aulas.
 * Ajuste do Julio em 20/10/2026: quem recebe os links e o responsavel quem
 * escolhe, por aluno; o contato do aluno so e obrigatorio se ele recebe. A
 * escola do aluno tambem vem do formulario (opcional, so as do catalogo).
 *
 * Esta funcao roda no servidor e e a unica barreira: o navegador pode mandar
 * qualquer coisa, entao nada aqui confia em mascara ou limite do formulario.
 */
import {
  cepValido,
  cpfValido,
  mascaraCep,
  mascaraCpf,
  mascaraTelefone,
  somenteDigitos,
} from '@/dominio/documentos/formato'

/** Irmaos no mesmo envio. Acima disso, a escola cadastra pela tela. */
export const MAXIMO_DE_ALUNOS = 6

/** Nenhum campo de texto passa disso, para o formulario publico nao encher o banco. */
const TAMANHO_MAXIMO = 120
const TAMANHO_MAXIMO_EMAIL = 254

export interface EntradaResponsavel {
  nome: string
  telefone: string
  email: string
  cpf: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
}

/** Os mesmos valores do enum `destinatario_notificacao` do banco. */
export type QuemRecebeLinks = 'Responsável' | 'Aluno' | 'Ambos'

export const QUEM_RECEBE_LINKS: { valor: QuemRecebeLinks; rotulo: string }[] = [
  { valor: 'Ambos', rotulo: 'O responsável e o aluno' },
  { valor: 'Responsável', rotulo: 'Só o responsável' },
  { valor: 'Aluno', rotulo: 'Só o aluno' },
]

export interface EntradaAluno {
  nome: string
  telefone: string
  email: string
  /** yyyy-mm-dd, ou vazio. */
  data_nascimento: string
  /** Id de uma escola do catalogo, ou vazio ("nao esta na lista"). */
  escola_id: string
  /** Vazio enquanto o responsavel nao escolheu. */
  recebe_links: QuemRecebeLinks | ''
}

export interface EntradaEnvio {
  responsavel: EntradaResponsavel
  alunos: EntradaAluno[]
  aceite: boolean
}

export interface ResponsavelValido {
  nome: string
  telefone: string
  email: string
  cpf: string
  cep: string
  endereco: string | null
  numero: string
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export interface AlunoValido {
  nome: string
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  escola_id: number | null
  destinatario_notificacao: QuemRecebeLinks
  canal_notificacao: 'WhatsApp' | 'Ambos'
}

export interface EnvioValido {
  responsavel: ResponsavelValido
  alunos: AlunoValido[]
}

export type ResultadoEnvio =
  | { ok: true; envio: EnvioValido }
  | { ok: false; erros: Record<string, string> }

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function ouNulo(v: string): string | null {
  return v === '' ? null : v
}

function emailValido(v: string): boolean {
  return v.length <= TAMANHO_MAXIMO_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/** 10 digitos (fixo) ou 11 (celular), com DDD. */
function telefoneValido(v: string): boolean {
  const d = somenteDigitos(v)
  return d.length === 10 || d.length === 11
}

/** Data real (rejeita 30/02) e nao posterior a hoje. */
function dataDeNascimentoValida(v: string, hoje: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false
  return v <= hoje
}

/**
 * @param hoje yyyy-mm-dd no fuso de Sao Paulo, para recusar nascimento no futuro.
 * @param escolas ids das escolas que o formulario oferece.
 */
export function validarEnvio(
  entrada: EntradaEnvio,
  hoje: string,
  escolas: number[],
): ResultadoEnvio {
  const erros: Record<string, string> = {}
  const r = entrada?.responsavel ?? ({} as EntradaResponsavel)

  const campo = (chave: string, valor: string, obrigatorio: boolean, rotulo: string): string => {
    if (obrigatorio && valor === '') erros[chave] = `Informe ${rotulo}.`
    else if (valor.length > TAMANHO_MAXIMO) erros[chave] = 'Texto longo demais.'
    return valor
  }

  const nome = campo('responsavel.nome', texto(r.nome), true, 'seu nome')
  const numero = campo('responsavel.numero', texto(r.numero), true, 'o número')
  const endereco = campo('responsavel.endereco', texto(r.endereco), false, '')
  const complemento = campo('responsavel.complemento', texto(r.complemento), false, '')
  const bairro = campo('responsavel.bairro', texto(r.bairro), false, '')
  const cidade = campo('responsavel.cidade', texto(r.cidade), false, '')

  const telefone = texto(r.telefone)
  if (telefone === '') erros['responsavel.telefone'] = 'Informe seu telefone.'
  else if (!telefoneValido(telefone)) erros['responsavel.telefone'] = 'Telefone com DDD, por favor.'

  const email = texto(r.email).toLowerCase()
  if (email === '') erros['responsavel.email'] = 'Informe seu e-mail.'
  else if (!emailValido(email)) erros['responsavel.email'] = 'E-mail inválido.'

  const cpf = texto(r.cpf)
  if (cpf === '') erros['responsavel.cpf'] = 'Informe seu CPF.'
  else if (!cpfValido(cpf)) erros['responsavel.cpf'] = 'CPF inválido.'

  const cep = texto(r.cep)
  if (cep === '') erros['responsavel.cep'] = 'Informe o CEP.'
  else if (!cepValido(cep)) erros['responsavel.cep'] = 'O CEP precisa ter 8 dígitos.'

  const estado = texto(r.estado).toUpperCase()
  if (estado !== '' && !/^[A-Z]{2}$/.test(estado)) {
    erros['responsavel.estado'] = 'Use a sigla de 2 letras, como RJ.'
  }

  const listaAlunos = Array.isArray(entrada?.alunos) ? entrada.alunos : []
  if (listaAlunos.length === 0) erros.alunos = 'Cadastre pelo menos um aluno.'
  else if (listaAlunos.length > MAXIMO_DE_ALUNOS) {
    erros.alunos = `No máximo ${MAXIMO_DE_ALUNOS} alunos por envio. Fale com a escola para cadastrar mais.`
  }

  const alunos: AlunoValido[] = listaAlunos.slice(0, MAXIMO_DE_ALUNOS).map((a, i) => {
    const p = `alunos.${i}`
    const nomeAluno = campo(`${p}.nome`, texto(a?.nome), true, 'o nome do aluno')
    const tel = texto(a?.telefone)
    const mail = texto(a?.email).toLowerCase()
    const nascimento = texto(a?.data_nascimento)
    const escola = texto(a?.escola_id)
    const recebe = QUEM_RECEBE_LINKS.find((q) => q.valor === a?.recebe_links)?.valor

    if (!recebe) erros[`${p}.recebe_links`] = 'Escolha quem recebe os links das aulas.'
    const alunoRecebe = recebe === 'Aluno' || recebe === 'Ambos'

    if (alunoRecebe && tel === '' && mail === '') {
      erros[`${p}.contato`] = 'Informe o telefone ou o e-mail do aluno, para ele receber os links das aulas.'
    }
    if (escola !== '' && !escolas.includes(Number(escola))) {
      erros[`${p}.escola_id`] = 'Escolha uma escola da lista.'
    }
    if (tel !== '' && !telefoneValido(tel)) erros[`${p}.telefone`] = 'Telefone com DDD, por favor.'
    if (mail !== '' && !emailValido(mail)) erros[`${p}.email`] = 'E-mail inválido.'
    if (nascimento !== '' && !dataDeNascimentoValida(nascimento, hoje)) {
      erros[`${p}.data_nascimento`] = 'Data de nascimento inválida.'
    }

    return {
      nome: nomeAluno,
      telefone: tel === '' ? null : mascaraTelefone(tel),
      email: ouNulo(mail),
      data_nascimento: ouNulo(nascimento),
      escola_id: escola === '' ? null : Number(escola),
      destinatario_notificacao: recebe ?? 'Ambos',
      // O WhatsApp e o canal da escola; so o aluno que recebe e nao tem
      // telefone pede "Ambos", senao ele ficaria sem nada (o envio pula quem
      // nao tem contato no canal, mensagens.ts). O responsavel sempre tem
      // telefone.
      canal_notificacao: alunoRecebe && tel === '' ? 'Ambos' : 'WhatsApp',
    }
  })

  if (entrada?.aceite !== true) {
    erros.aceite = 'Para enviar, é preciso concordar com o uso dos dados.'
  }

  if (Object.keys(erros).length > 0) return { ok: false, erros }

  return {
    ok: true,
    envio: {
      responsavel: {
        nome,
        telefone: mascaraTelefone(telefone),
        email,
        cpf: mascaraCpf(cpf),
        cep: mascaraCep(cep),
        endereco: ouNulo(endereco),
        numero,
        complemento: ouNulo(complemento),
        bairro: ouNulo(bairro),
        cidade: ouNulo(cidade),
        estado: ouNulo(estado),
      },
      alunos,
    },
  }
}
