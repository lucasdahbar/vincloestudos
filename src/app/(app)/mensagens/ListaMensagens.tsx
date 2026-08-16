'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { confirmarEnvio, prepararLembretes } from './acoes'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'

export interface MensagemNaTela {
  id: number
  tipo: string
  canal: string
  destinatario_nome: string
  contato: string | null
  agendado_para: string | null
  texto_gerado: string
}

const ROTULO: Record<string, string> = {
  BoasVindas: 'Boas-vindas',
  LinkAula: 'Link da aula',
  Cobranca: 'Cobrança',
}

function quando(iso: string | null): string {
  if (!iso) return 'agora'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Link que abre o WhatsApp com o texto pronto. Numero so com digitos. */
function linkWhatsApp(contato: string | null, texto: string): string | null {
  if (!contato) return null
  const numero = contato.replace(/\D/g, '')
  if (numero.length < 10) return null
  const comPais = numero.startsWith('55') ? numero : `55${numero}`
  return `https://wa.me/${comPais}?text=${encodeURIComponent(texto)}`
}

export function ListaMensagens({ mensagens }: { mensagens: MensagemNaTela[] }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [aviso, setAviso] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-5">
      <Cartao className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg">Preparar lembretes das aulas online</h2>
          <p className="mt-1 text-sm text-tinta-suave">
            Monta a mensagem com o link de cada aula online das próximas 48 horas, para o aluno
            ou responsável, conforme a preferência de cada aluno.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Botao
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const total = await prepararLembretes()
                setAviso(
                  total === 0
                    ? 'Nenhum lembrete novo — as aulas online das próximas 48h já estão na lista.'
                    : `${total} mensagem(ns) preparada(s).`,
                )
                router.refresh()
              })
            }
          >
            {pendente ? 'Preparando…' : 'Preparar lembretes'}
          </Botao>
          {aviso && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-tinta-suave"
            >
              {aviso}
            </motion.span>
          )}
        </div>
      </Cartao>

      {mensagens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma mensagem para enviar"
          descricao="As boas-vindas aparecem aqui quando você matricula um aluno numa turma, e os lembretes das aulas online quando você prepara acima."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {mensagens.map((m) => {
              const wa = m.canal === 'WhatsApp' ? linkWhatsApp(m.contato, m.texto_gerado) : null

              return (
                <motion.li
                  key={m.id}
                  layout
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  className="overflow-hidden"
                >
                  <Cartao>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{m.destinatario_nome}</p>
                        <p className="mt-0.5 text-sm text-tinta-suave">
                          {m.contato ?? 'sem contato cadastrado'} · {quando(m.agendado_para)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Selo tom="neutro">{ROTULO[m.tipo] ?? m.tipo}</Selo>
                        <Selo tom="encerrado">{m.canal}</Selo>
                      </div>
                    </div>

                    <pre className="mt-3 whitespace-pre-wrap rounded-campo bg-superficie-2 p-4 text-sm">
                      {m.texto_gerado}
                    </pre>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[44px] items-center rounded-campo bg-destaque px-5 font-medium text-white shadow-destaque transition-colors hover:bg-destaque-forte"
                        >
                          Abrir no WhatsApp
                        </a>
                      )}
                      <Botao
                        aparencia="secundario"
                        onClick={async () => {
                          await navigator.clipboard.writeText(m.texto_gerado)
                          setCopiado(m.id)
                          setTimeout(() => setCopiado(null), 2500)
                        }}
                      >
                        {copiado === m.id ? 'Copiado!' : 'Copiar texto'}
                      </Botao>
                      <Botao
                        aparencia="discreto"
                        disabled={pendente}
                        onClick={() =>
                          iniciar(async () => {
                            await confirmarEnvio(m.id)
                            router.refresh()
                          })
                        }
                      >
                        Já enviei
                      </Botao>
                    </div>
                  </Cartao>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
