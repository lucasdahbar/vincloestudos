import { describe, expect, it } from 'vitest'
import { validarEnvio, type EntradaEnvio } from './envio'

function entrada(mudar: (e: EntradaEnvio) => void = () => {}): EntradaEnvio {
  const e: EntradaEnvio = {
    responsavel: {
      nome: ' Maria Souza ',
      telefone: '21987654321',
      email: 'maria@exemplo.com',
      cpf: '52998224725',
      cep: '22041001',
      endereco: 'Rua Barata Ribeiro',
      numero: '100',
      complemento: '',
      bairro: 'Copacabana',
      cidade: 'Rio de Janeiro',
      estado: 'rj',
    },
    alunos: [{ nome: 'João Souza', telefone: '21912345678', email: '', data_nascimento: '' }],
    aceite: true,
  }
  mudar(e)
  return e
}

describe('validarEnvio — responsável', () => {
  it('aceita um envio completo e grava com máscara', () => {
    const r = validarEnvio(entrada(), '2026-10-18')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.envio.responsavel).toMatchObject({
      nome: 'Maria Souza',
      telefone: '(21) 98765-4321',
      cpf: '529.982.247-25',
      cep: '22041-001',
      estado: 'RJ',
      complemento: null,
    })
  })

  it('exige nome, telefone, e-mail, CPF, CEP e número (decisão do Julio, 18/10/2026)', () => {
    const r = validarEnvio(
      entrada((e) => {
        e.responsavel.nome = ''
        e.responsavel.telefone = ''
        e.responsavel.email = ''
        e.responsavel.cpf = ''
        e.responsavel.cep = ''
        e.responsavel.numero = ' '
      }),
      '2026-10-18',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    for (const campo of ['nome', 'telefone', 'email', 'cpf', 'cep', 'numero']) {
      expect(r.erros[`responsavel.${campo}`]).toBeTruthy()
    }
  })

  it('o logradouro, o bairro e a cidade não são obrigatórios: vêm do CEP', () => {
    const r = validarEnvio(
      entrada((e) => {
        e.responsavel.endereco = ''
        e.responsavel.bairro = ''
        e.responsavel.cidade = ''
        e.responsavel.estado = ''
      }),
      '2026-10-18',
    )
    expect(r.ok).toBe(true)
  })

  it('recusa CPF com dígito errado, telefone curto, e-mail e CEP malformados', () => {
    const r = validarEnvio(
      entrada((e) => {
        e.responsavel.cpf = '52998224724'
        e.responsavel.telefone = '2198765'
        e.responsavel.email = 'maria@'
        e.responsavel.cep = '2204100'
      }),
      '2026-10-18',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.erros).sort()).toEqual(
      ['responsavel.cep', 'responsavel.cpf', 'responsavel.email', 'responsavel.telefone'].sort(),
    )
  })

  it('recusa UF que não tem duas letras', () => {
    const r = validarEnvio(entrada((e) => (e.responsavel.estado = 'Rio')), '2026-10-18')
    expect(r.ok).toBe(false)
  })

  it('corta textos longos demais, para ninguém encher o banco pelo formulário público', () => {
    const r = validarEnvio(entrada((e) => (e.responsavel.nome = 'a'.repeat(500))), '2026-10-18')
    expect(r.ok).toBe(false)
  })
})

describe('validarEnvio — alunos', () => {
  it('exige pelo menos um aluno', () => {
    const r = validarEnvio(entrada((e) => (e.alunos = [])), '2026-10-18')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erros.alunos).toBeTruthy()
  })

  it('aceita irmãos no mesmo envio, até o limite', () => {
    const irmao = { nome: 'Ana Souza', telefone: '', email: 'ana@exemplo.com', data_nascimento: '' }
    expect(validarEnvio(entrada((e) => e.alunos.push(irmao)), '2026-10-18').ok).toBe(true)
    const muitos = validarEnvio(
      entrada((e) => (e.alunos = Array.from({ length: 7 }, () => ({ ...irmao })))),
      '2026-10-18',
    )
    expect(muitos.ok).toBe(false)
  })

  it('exige o nome e pelo menos um entre telefone e e-mail (para os links das aulas)', () => {
    const r = validarEnvio(
      entrada((e) => (e.alunos = [{ nome: '', telefone: '', email: '', data_nascimento: '' }])),
      '2026-10-18',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erros['alunos.0.nome']).toBeTruthy()
    expect(r.erros['alunos.0.contato']).toBeTruthy()
  })

  it('a data de nascimento é opcional, mas não pode ser no futuro nem inválida', () => {
    expect(
      validarEnvio(entrada((e) => (e.alunos[0].data_nascimento = '2015-03-10')), '2026-10-18').ok,
    ).toBe(true)
    expect(
      validarEnvio(entrada((e) => (e.alunos[0].data_nascimento = '2027-01-01')), '2026-10-18').ok,
    ).toBe(false)
    expect(
      validarEnvio(entrada((e) => (e.alunos[0].data_nascimento = '2015-02-30')), '2026-10-18').ok,
    ).toBe(false)
  })

  it('os links vão para o aluno e para o responsável', () => {
    // Decisao de 18/10/2026: o aluno informa o contato justamente para receber
    // os links das aulas, e o responsavel continua recebendo tambem.
    const r = validarEnvio(entrada(), '2026-10-18')
    if (!r.ok) throw new Error('deveria aceitar')
    expect(r.envio.alunos[0].destinatario_notificacao).toBe('Ambos')
  })

  it('canal WhatsApp quando o aluno tem telefone; Ambos quando só tem e-mail', () => {
    // Com canal so WhatsApp, um aluno sem telefone nao receberia nada.
    const comTelefone = validarEnvio(entrada(), '2026-10-18')
    const soEmail = validarEnvio(
      entrada((e) => {
        e.alunos[0].telefone = ''
        e.alunos[0].email = 'joao@exemplo.com'
      }),
      '2026-10-18',
    )
    if (!comTelefone.ok || !soEmail.ok) throw new Error('deveria aceitar')
    expect(comTelefone.envio.alunos[0].canal_notificacao).toBe('WhatsApp')
    expect(soEmail.envio.alunos[0].canal_notificacao).toBe('Ambos')
  })
})

describe('validarEnvio — LGPD', () => {
  it('exige o aceite', () => {
    const r = validarEnvio(entrada((e) => (e.aceite = false)), '2026-10-18')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erros.aceite).toBeTruthy()
  })
})
