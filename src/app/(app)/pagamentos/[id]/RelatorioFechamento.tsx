'use client'

import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { cancelarConta } from '../acoes'
import { useRouter } from 'next/navigation'
import { Botao } from '@/ui/Botao'

/**
 * P6 (Rodada 2): o relatorio de fechamento, no formato que a gestora aprovou.
 *
 * O texto vem pronto do servidor — a formatacao e regra de negocio testada, nao
 * decoracao de tela. Aqui so entram as tres formas de entregar: WhatsApp,
 * copiar e imprimir.
 */
export function RelatorioFechamento({
  contaId,
  texto,
  telefone,
  podeCancelar,
  presencas,
}: {
  contaId: number
  texto: string
  telefone: string | null
  /** P5: só conta Pendente, sem nenhuma baixa. */
  podeCancelar: boolean
  presencas: number
}) {
  const router = useRouter()
  const [copiado, setCopiado] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const numero = (telefone ?? '').replace(/\D/g, '')
  const whatsapp = numero
    ? `https://wa.me/${numero.startsWith('55') ? numero : `55${numero}`}?text=${encodeURIComponent(texto)}`
    : null

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg">Relatório do fechamento</h2>

      {/* `print:` deixa só o relatório na folha: a navegação e os botões não
          fazem sentido impressos. */}
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-cartao border border-borda bg-superficie-2 p-5 font-mono text-sm print:border-0 print:bg-transparent print:p-0">
        {texto}
      </pre>

      <div className="flex flex-wrap gap-3 print:hidden">
        {whatsapp && (
          <Botao
            type="button"
            onClick={() => window.open(whatsapp, '_blank', 'noopener,noreferrer')}
          >
            Abrir no WhatsApp
          </Botao>
        )}
        <Botao
          type="button"
          aparencia={whatsapp ? 'secundario' : 'primario'}
          onClick={async () => {
            await navigator.clipboard.writeText(texto)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 2500)
          }}
        >
          {copiado ? 'Copiado!' : 'Copiar texto'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => window.print()}>
          Imprimir ou salvar em PDF
        </Botao>
      </div>

      {!whatsapp && (
        <p className="text-sm text-tinta-suave print:hidden">
          Cadastre o telefone do professor para enviar direto pelo WhatsApp.
        </p>
      )}

      {/* P5 */}
      {podeCancelar && (
        <div className="mt-3 border-t border-borda pt-6 print:hidden">
          {!confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="min-h-[44px] text-sm font-medium text-tinta-suave underline-offset-4 hover:text-erro hover:underline"
            >
              Cancelar este fechamento
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-erro">
                O fechamento fica marcado como Cancelado e as {presencas}{' '}
                {presencas === 1 ? 'presença volta' : 'presenças voltam'} a ficar disponíveis
                para o próximo fechamento. Use isto se o fechamento saiu errado.
              </p>
              <div className="flex flex-wrap gap-3">
                <Botao
                  type="button"
                  disabled={pendente}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await cancelarConta(contaId)
                      if (r.ok) router.refresh()
                      else setErro(r.motivo ?? 'Não foi possível cancelar.')
                    })
                  }
                >
                  {pendente ? 'Cancelando…' : 'Sim, cancelar o fechamento'}
                </Botao>
                <Botao type="button" aparencia="secundario" onClick={() => setConfirmando(false)}>
                  Voltar
                </Botao>
              </div>
            </div>
          )}
        </div>
      )}

      {erro && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="alert"
          className="rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro print:hidden"
        >
          {erro}
        </motion.p>
      )}
    </div>
  )
}
