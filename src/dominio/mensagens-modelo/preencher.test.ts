import { describe, expect, it } from 'vitest'
import { camposUsados, preencher, validarModelo } from './preencher'

describe('preencher', () => {
  it('troca cada {campo} pelo valor', () => {
    expect(preencher('Oi, {nome}! Turma {turma}.', { nome: 'Ana', turma: 'Mat' })).toBe(
      'Oi, Ana! Turma Mat.',
    )
  })

  it('troca o mesmo campo repetido', () => {
    expect(preencher('{a} e {a}', { a: 'x' })).toBe('x e x')
  })

  it('deixa um campo desconhecido como esta, para o erro aparecer em vez de sumir', () => {
    expect(preencher('Oi, {nom}!', { nome: 'Ana' })).toBe('Oi, {nom}!')
  })

  it('tira a linha que so tinha campos e ficou vazia', () => {
    const modelo = 'Aula\n{sala}\n\nAbraço'
    expect(preencher(modelo, { sala: '' })).toBe('Aula\n\nAbraço')
    expect(preencher(modelo, { sala: 'Link aqui' })).toBe('Aula\nLink aqui\n\nAbraço')
  })

  it('mantem a linha vazia que o autor escreveu de proposito', () => {
    expect(preencher('a\n\nb', {})).toBe('a\n\nb')
  })

  it('nao deixa duas linhas em branco seguidas depois de tirar uma linha', () => {
    expect(preencher('a\n\n{x}\n\nb', { x: '' })).toBe('a\n\nb')
  })

  it('valor com varias linhas entra inteiro', () => {
    expect(preencher('Dados:\n{lista}', { lista: 'um\ndois' })).toBe('Dados:\num\ndois')
  })

  it('nao usa $ do valor como padrao de troca', () => {
    expect(preencher('Valor: {v}', { v: 'R$ 100 $& $1' })).toBe('Valor: R$ 100 $& $1')
  })

  it('apara espacos e linhas vazias nas pontas', () => {
    expect(preencher('\n\n  Oi  \n\n', {})).toBe('Oi')
  })
})

describe('camposUsados', () => {
  it('lista os campos sem repetir', () => {
    expect(camposUsados('{a} {b} {a}')).toEqual(['a', 'b'])
  })
})

describe('validarModelo', () => {
  const campos = ['nome', 'link']

  it('aceita um texto com campos conhecidos', () => {
    expect(validarModelo('Oi {nome}, {link}', campos, ['link'])).toEqual([])
  })

  it('recusa texto vazio', () => {
    expect(validarModelo('   ', campos, [])).toEqual(['O texto não pode ficar vazio.'])
  })

  it('aponta o campo que nao existe', () => {
    expect(validarModelo('Oi {nom} {link}', campos, ['link'])).toEqual([
      'O campo {nom} não existe nesta mensagem.',
    ])
  })

  it('aponta o campo obrigatorio que faltou', () => {
    expect(validarModelo('Oi {nome}', campos, ['link'])).toEqual([
      'Falta o campo {link}: sem ele a mensagem sai sem a informação principal.',
    ])
  })

  it('aponta chave aberta sem fechar', () => {
    expect(validarModelo('Oi {nome {link}', campos, ['link'])).toEqual([
      'Há uma chave { ou } sem par. Os campos têm o formato {nome}.',
    ])
  })
})
