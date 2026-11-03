'use client'

import { useRef, useState, useTransition } from 'react'
import { restaurarTextoDaMensagem, salvarTextoDaMensagem } from './acoes'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entradaClasse } from '@/ui/Campo'
import { Selo } from '@/ui/Selo'
import { preencher, validarModelo } from '@/dominio/mensagens-modelo/preencher'
import type { CampoModelo } from '@/dominio/mensagens-modelo/catalogo'

interface Props {
  chave: string
  titulo: string
  quando: string
  campos: CampoModelo[]
  obrigatorios: string[]
  exemplo: Record<string, string>
  padrao: string
  /** O que vale hoje: a edicao ou, sem ela, o original. */
  textoAtual: string
  editado: boolean
  /** "Kelly, em 03/11/2026", quando editado. */
  autoria: string | null
}

/**
 * Uma mensagem editavel: caixa de texto, campos para inserir com um toque,
 * previa com dados de exemplo e os avisos de erro na hora (campo que nao
 * existe, campo obrigatorio que faltou). O servidor confere de novo ao salvar.
 */
export function EditorDeMensagem({
  chave,
  titulo,
  quando,
  campos,
  obrigatorios,
  exemplo,
  padrao,
  textoAtual,
  editado,
  autoria,
}: Props) {
  const [texto, setTexto] = useState(textoAtual)
  const [salvo, setSalvo] = useState(textoAtual)
  const [foiEditado, setFoiEditado] = useState(editado)
  const [errosDoServidor, setErrosDoServidor] = useState<string[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmandoRestaurar, setConfirmandoRestaurar] = useState(false)
  const [pendente, iniciar] = useTransition()
  const caixa = useRef<HTMLTextAreaElement>(null)

  const nomesDosCampos = campos.map((c) => c.nome)
  const erros = validarModelo(texto, nomesDosCampos, obrigatorios)
  const mudou = texto.replace(/\r\n/g, '\n').trim() !== salvo.trim()

  /** Insere o campo onde o cursor esta, em vez de no fim do texto. */
  function inserir(nome: string) {
    const el = caixa.current
    const marca = `{${nome}}`
    if (!el) {
      setTexto((t) => t + marca)
      return
    }
    const inicio = el.selectionStart
    const fim = el.selectionEnd
    setTexto(texto.slice(0, inicio) + marca + texto.slice(fim))
    // Devolve o foco e coloca o cursor logo depois do campo inserido.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(inicio + marca.length, inicio + marca.length)
    })
  }

  function salvar() {
    setErrosDoServidor([])
    setAviso(null)
    iniciar(async () => {
      const r = await salvarTextoDaMensagem(chave, texto)
      if (!r.ok) {
        setErrosDoServidor(r.erros)
        return
      }
      const limpo = texto.replace(/\r\n/g, '\n').trim()
      setTexto(limpo)
      setSalvo(limpo)
      setFoiEditado(limpo !== padrao)
      setAviso('Salvo. A próxima mensagem já sai com este texto.')
    })
  }

  function restaurar() {
    setErrosDoServidor([])
    setAviso(null)
    setConfirmandoRestaurar(false)
    iniciar(async () => {
      const r = await restaurarTextoDaMensagem(chave)
      if (!r.ok) {
        setErrosDoServidor(r.erros)
        return
      }
      setTexto(padrao)
      setSalvo(padrao)
      setFoiEditado(false)
      setAviso('Voltou ao texto original.')
    })
  }

  const idCaixa = `texto-${chave}`
  const todosOsErros = [...erros, ...errosDoServidor]

  return (
    <Cartao className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg">{titulo}</h3>
          <p className="mt-1 text-sm text-tinta-suave">{quando}</p>
        </div>
        {foiEditado ? (
          <Selo tom="alerta">Editada{autoria ? ` · ${autoria}` : ''}</Selo>
        ) : (
          <Selo tom="encerrado">Texto original</Selo>
        )}
      </div>

      <div>
        <label htmlFor={idCaixa} className="mb-1 block font-medium text-tinta">
          Texto da mensagem
        </label>
        <textarea
          id={idCaixa}
          ref={caixa}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            setAviso(null)
            setErrosDoServidor([])
          }}
          rows={Math.min(14, Math.max(5, texto.split('\n').length + 1))}
          className={`${entradaClasse} font-sans leading-relaxed`}
          aria-describedby={todosOsErros.length > 0 ? `${idCaixa}-erros` : undefined}
          aria-invalid={todosOsErros.length > 0}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-tinta">
          Campos (toque para inserir onde o cursor está)
        </p>
        <ul className="flex flex-wrap gap-2">
          {campos.map((c) => (
            <li key={c.nome}>
              <button
                type="button"
                onClick={() => inserir(c.nome)}
                title={c.descricao}
                className="min-h-[44px] rounded-campo border border-borda bg-superficie-2 px-3 text-sm text-tinta transition-colors hover:border-destaque hover:text-destaque-forte"
              >
                {`{${c.nome}}`}
                {obrigatorios.includes(c.nome) && (
                  <span className="ml-1 text-tinta-tenue">obrigatório</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm text-tinta-suave sm:grid-cols-[auto_1fr]">
          {campos.map((c) => (
            <div key={c.nome} className="contents">
              <dt className="font-mono text-tinta">{`{${c.nome}}`}</dt>
              <dd>{c.descricao}</dd>
            </div>
          ))}
        </dl>
      </div>

      {todosOsErros.length > 0 && (
        <ul id={`${idCaixa}-erros`} role="alert" className="flex flex-col gap-1 text-sm text-erro">
          {todosOsErros.map((e) => (
            <li key={e} className="flex items-start gap-1.5">
              <span aria-hidden="true">•</span>
              {e}
            </li>
          ))}
        </ul>
      )}

      <div>
        <p className="mb-1 text-sm font-medium text-tinta">Como vai ficar (com dados de exemplo)</p>
        <pre className="whitespace-pre-wrap rounded-campo bg-superficie-2 p-4 font-sans text-sm leading-relaxed">
          {preencher(texto, exemplo)}
        </pre>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Botao onClick={salvar} disabled={pendente || !mudou || erros.length > 0}>
          {pendente ? 'Salvando…' : 'Salvar texto'}
        </Botao>

        {(foiEditado || texto !== padrao) &&
          (confirmandoRestaurar ? (
            <>
              <span className="text-sm text-tinta-suave">Apagar a edição e voltar ao original?</span>
              <Botao aparencia="perigo" onClick={restaurar} disabled={pendente}>
                Sim, restaurar
              </Botao>
              <Botao aparencia="discreto" onClick={() => setConfirmandoRestaurar(false)}>
                Não
              </Botao>
            </>
          ) : (
            <Botao
              aparencia="secundario"
              onClick={() => setConfirmandoRestaurar(true)}
              disabled={pendente}
            >
              Restaurar o texto original
            </Botao>
          ))}

        {aviso && (
          <span role="status" className="text-sm text-apoio">
            {aviso}
          </span>
        )}
      </div>
    </Cartao>
  )
}
