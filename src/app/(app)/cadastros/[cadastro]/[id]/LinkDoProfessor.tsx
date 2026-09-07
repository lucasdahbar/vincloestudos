'use client'

import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { gerarLinkDoProfessor } from '../acoes-professor'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { MARCA } from '@/marca'

/**
 * R1 e R4 (Rodada 2): o link pessoal e permanente de presenca do professor.
 *
 * Enviado UMA vez. Ele cobre todas as turmas do professor, inclusive as criadas
 * depois — por isso a tela insiste que nao e preciso reenviar a cada aula: era
 * exatamente o trabalho que o item veio eliminar.
 */
export function LinkDoProfessor({
  professorId,
  nome,
  telefone,
  linkInicial,
}: {
  professorId: number
  nome: string
  telefone: string | null
  linkInicial: string | null
}) {
  const [link, setLink] = useState(linkInicial)
  const [pendente, iniciar] = useTransition()
  const [copiado, setCopiado] = useState(false)
  const [confirmandoTroca, setConfirmandoTroca] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const primeiroNome = nome.trim().split(/\s+/)[0]
  const mensagem = link
    ? `Olá, ${primeiroNome}! Este é o seu link de presença do ${MARCA}:\n\n${link}\n\nEle é sempre o mesmo, para todas as suas turmas — salve no celular. Na hora da aula, é só abrir que ele mostra a turma do momento.`
    : ''

  function pedirLink(trocar: boolean) {
    setErro(null)
    iniciar(async () => {
      const r = await gerarLinkDoProfessor(professorId, trocar)
      if (r.ok) {
        setLink(r.link)
        setConfirmandoTroca(false)
      } else {
        setErro(r.motivo)
      }
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

  // Só dígitos, com o 55 do Brasil na frente — formato que o wa.me espera.
  const numero = (telefone ?? '').replace(/\D/g, '')
  const whatsapp = numero
    ? `https://wa.me/${numero.startsWith('55') ? numero : `55${numero}`}?text=${encodeURIComponent(mensagem)}`
    : null

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Link de presença</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Link pessoal e permanente para {primeiroNome} marcar presença. Envie{' '}
          <strong>uma vez só</strong>: ele serve para todas as turmas dele, inclusive as que
          você criar depois.
        </p>
      </div>

      {!link ? (
        <div>
          <Botao type="button" onClick={() => pedirLink(false)} disabled={pendente}>
            {pendente ? 'Gerando…' : 'Gerar link de presença'}
          </Botao>
        </div>
      ) : (
        <>
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
          </div>

          {!whatsapp && (
            <p className="text-sm text-tinta-suave">
              Cadastre o telefone deste professor para enviar direto pelo WhatsApp.
            </p>
          )}

          <div className="border-t border-borda pt-4">
            {!confirmandoTroca ? (
              <button
                type="button"
                onClick={() => setConfirmandoTroca(true)}
                className="min-h-[44px] text-sm font-medium text-tinta-suave underline-offset-4 hover:underline"
              >
                Gerar um link novo
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
              >
                <p className="text-sm text-erro">
                  O link atual para de funcionar na hora. {primeiroNome} vai precisar do novo
                  link para marcar presença. Faça isso se ele perdeu o acesso ou trocou de
                  aparelho.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Botao type="button" onClick={() => pedirLink(true)} disabled={pendente}>
                    {pendente ? 'Gerando…' : 'Sim, gerar link novo'}
                  </Botao>
                  <Botao
                    type="button"
                    aparencia="secundario"
                    onClick={() => setConfirmandoTroca(false)}
                  >
                    Cancelar
                  </Botao>
                </div>
              </motion.div>
            )}
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
