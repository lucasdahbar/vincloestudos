'use client'

import { useState, useTransition } from 'react'
import { gerarConvite } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'
import { aplicarMascara } from '@/dominio/documentos/formato'
import { DIAS_DE_VALIDADE } from '@/dominio/cadastro-publico/convite'
import { MARCA } from '@/marca'

/**
 * Gera o link de cadastro de uma familia. O link so aparece aqui, na hora: o
 * banco guarda o hash do token, entao a tela avisa para enviar antes de sair.
 */
export function NovoConvite() {
  const [identificacao, setIdentificacao] = useState('')
  const [telefone, setTelefone] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pendente, iniciar] = useTransition()

  const mensagem = link
    ? `Olá! Para fazer o cadastro na ${MARCA}, é só preencher seus dados e os do aluno neste link:\n\n${link}\n\nO link vale por ${DIAS_DE_VALIDADE} dias e pode ser usado uma vez.`
    : ''

  // Só dígitos, com o 55 do Brasil na frente — formato que o wa.me espera.
  const numero = telefone.replace(/\D/g, '')
  const whatsapp =
    link && numero.length >= 10
      ? `https://wa.me/${numero.startsWith('55') ? numero : `55${numero}`}?text=${encodeURIComponent(mensagem)}`
      : null

  function gerar() {
    setErro(null)
    iniciar(async () => {
      const r = await gerarConvite(identificacao)
      if (r.ok) setLink(r.link)
      else setErro(r.motivo)
    })
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não foi possível copiar. Selecione o texto e copie à mão.')
    }
  }

  function outro() {
    setLink(null)
    setIdentificacao('')
    setTelefone('')
  }

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Enviar link de cadastro</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Um link por família. O responsável preenche os dados dele e dos alunos, e o cadastro
          aparece aqui para você conferir. O link vale {DIAS_DE_VALIDADE} dias e uma vez só.
        </p>
      </div>

      {!link ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Para quem" ajuda="Só para você reconhecer depois. Ex.: Maria, mãe do João.">
              <input
                className={entradaClasse}
                maxLength={120}
                value={identificacao}
                onChange={(e) => setIdentificacao(e.target.value)}
              />
            </Campo>
            <Campo etiqueta="WhatsApp" ajuda="Opcional. Para abrir a conversa já com a mensagem.">
              <input
                className={entradaClasse}
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(aplicarMascara('telefone', e.target.value))}
              />
            </Campo>
          </div>
          <div>
            <Botao type="button" onClick={gerar} disabled={pendente}>
              {pendente ? 'Gerando…' : 'Gerar link'}
            </Botao>
          </div>
        </>
      ) : (
        <>
          <p className="rounded-campo bg-alerta-suave px-4 py-3 text-sm">
            Envie agora: por segurança, este link não fica guardado e não aparece de novo. Se
            perder, gere outro.
          </p>
          <code className="block break-all rounded-campo bg-superficie-2 px-4 py-3 text-sm">
            {link}
          </code>
          <div className="flex flex-wrap gap-3">
            {whatsapp && (
              <Botao
                type="button"
                onClick={() => window.open(whatsapp, '_blank', 'noopener,noreferrer')}
              >
                Abrir no WhatsApp
              </Botao>
            )}
            <Botao type="button" aparencia="secundario" onClick={copiar}>
              {copiado ? 'Copiado!' : 'Copiar mensagem'}
            </Botao>
            <Botao type="button" aparencia="discreto" onClick={outro}>
              Gerar outro link
            </Botao>
          </div>
        </>
      )}

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erro}
        </p>
      )}
    </Cartao>
  )
}
