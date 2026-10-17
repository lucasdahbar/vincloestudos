'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { registrarEnvioDoLink } from '../../acoes'
import { linkEmail, linkWhatsApp, type DestinoDoLink } from '@/dominio/notificacoes/link-da-aula'

/** "às 10:32" hoje; "em 15/10 às 10:32" em outro dia. No relógio da escola. */
function quandoEnviou(iso: string): string {
  const fuso = { timeZone: 'America/Sao_Paulo' } as const
  const dia = (d: Date) => d.toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: '2-digit' })
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit' })
  return dia(d) === dia(new Date()) ? `às ${hora}` : `em ${dia(d)} às ${hora}`
}

/**
 * O link da aula, enviado pela própria aula (pedido de 16/10/2026).
 *
 * Fica ao lado do nome, como o "Avisou que não vem": a gestora trabalha aula
 * por aula. O clique abre o WhatsApp (ou o e-mail) com o texto pronto e já
 * registra o envio — a fila antiga pedia um "Já enviei" à parte, e o envio
 * esquecido de marcar parecia uma mensagem que voltava.
 */
export function EnviarLink({
  aulaId,
  alunoId,
  destinos,
}: {
  aulaId: number
  alunoId: number
  destinos: DestinoDoLink[]
}) {
  const router = useRouter()
  const [, iniciar] = useTransition()
  // O horário aparece na hora do clique, sem esperar o servidor.
  const [enviadoAgora, setEnviadoAgora] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  if (destinos.length === 0) {
    return <span className="text-sm text-tinta-suave">Sem contato para o link</span>
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      {destinos.map((d) => {
        const chave = `${d.destinatario_tipo}|${d.canal}`
        const href =
          d.canal === 'WhatsApp'
            ? linkWhatsApp(d.contato, d.texto)
            : linkEmail(d.contato, 'Link da aula', d.texto)
        const enviado = enviadoAgora[chave] ?? d.enviado_em

        if (!href) {
          return (
            <span key={chave} className="text-sm text-tinta-suave">
              {d.rotulo}: contato inválido
            </span>
          )
        }

        return (
          <span key={chave} className="flex flex-wrap items-center justify-end gap-x-2 text-sm">
            {enviado && <span className="text-tinta-suave">Enviado {quandoEnviou(enviado)}</span>}
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setErro(null)
                setEnviadoAgora((e) => ({ ...e, [chave]: new Date().toISOString() }))
                iniciar(async () => {
                  const r = await registrarEnvioDoLink(aulaId, alunoId, d.destinatario_tipo, d.canal)
                  if (r.ok) router.refresh()
                  else {
                    setErro(r.motivo)
                    setEnviadoAgora((e) => {
                      const resto = { ...e }
                      delete resto[chave]
                      return resto
                    })
                  }
                })
              }}
              className="inline-flex min-h-[44px] items-center font-medium text-destaque underline-offset-4 hover:underline"
            >
              {enviado ? d.rotulo.replace('Enviar', 'Reenviar') : d.rotulo}
            </a>
          </span>
        )
      })}
      {erro && <span className="text-sm text-erro">{erro}</span>}
    </span>
  )
}
