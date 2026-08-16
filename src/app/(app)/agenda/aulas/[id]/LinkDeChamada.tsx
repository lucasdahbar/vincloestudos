'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { criarLinkDeChamada, reabrirChamadaDaAula } from '../../acoes'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'

interface Props {
  aulaId: number
  turmaNome: string
  professorNome: string | null
  quando: string
  /** Caminho do link ja existente, se houver. */
  caminhoExistente: string | null
  jaConfirmada: boolean
}

/**
 * Gera e entrega o link da chamada.
 *
 * Sem esta tela o sistema nao roda: a funcao de gerar token existia no servidor,
 * mas nenhuma pagina a chamava — entao o professor nunca recebia o link, a
 * chamada nunca era feita, e sem presenca nao ha reposicao nem pagamento.
 */
export function LinkDeChamada({
  aulaId,
  turmaNome,
  professorNome,
  quando,
  caminhoExistente,
  jaConfirmada,
}: Props) {
  const router = useRouter()
  const [caminho, setCaminho] = useState(caminhoExistente)
  const [copiado, setCopiado] = useState<'link' | 'mensagem' | null>(null)
  const [pendente, iniciar] = useTransition()

  // Montado no cliente: o servidor nao sabe o dominio publico.
  const urlCompleta = caminho ? `${typeof window !== 'undefined' ? window.location.origin : ''}${caminho}` : ''

  const mensagem =
    `Olá${professorNome ? `, ${professorNome.split(' ')[0]}` : ''}! ` +
    `Segue o link para registrar a presença da aula de ${turmaNome}, ${quando}:\n\n` +
    `${urlCompleta}\n\n` +
    `É só marcar quem veio e tocar em "Confirmar presenças". O link vale por 48 horas.`

  async function copiar(texto: string, qual: 'link' | 'mensagem') {
    await navigator.clipboard.writeText(texto)
    setCopiado(qual)
    setTimeout(() => setCopiado(null), 2500)
  }

  if (jaConfirmada) {
    return (
      <Cartao className="border-apoio-borda bg-apoio-suave">
        <h2 className="text-lg text-apoio">Chamada confirmada</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          O professor já registrou as presenças e o link foi bloqueado. Se precisar corrigir
          algo, reabra para ele.
        </p>
        <Botao
          aparencia="secundario"
          className="mt-4"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const novo = await reabrirChamadaDaAula(aulaId)
              setCaminho(novo)
              router.refresh()
            })
          }
        >
          {pendente ? 'Reabrindo…' : 'Reabrir a chamada'}
        </Botao>
      </Cartao>
    )
  }

  return (
    <Cartao>
      <h2 className="text-lg">Link da chamada</h2>
      <p className="mt-1 text-sm text-tinta-suave">
        Envie ao professor. Ele abre no celular e marca as presenças sem precisar de senha.
      </p>

      {!caminho ? (
        <Botao
          className="mt-4"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setCaminho(await criarLinkDeChamada(aulaId))
              router.refresh()
            })
          }
        >
          {pendente ? 'Gerando…' : 'Gerar link para o professor'}
        </Botao>
      ) : (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
          <p className="break-all rounded-campo border border-borda bg-superficie-2 px-4 py-3 font-mono text-sm">
            {urlCompleta}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Botao onClick={() => copiar(mensagem, 'mensagem')}>
              {copiado === 'mensagem' ? 'Copiado!' : 'Copiar mensagem para o WhatsApp'}
            </Botao>
            <Botao aparencia="secundario" onClick={() => copiar(urlCompleta, 'link')}>
              {copiado === 'link' ? 'Copiado!' : 'Copiar só o link'}
            </Botao>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-tinta-suave">
              Ver a mensagem que será copiada
            </summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-campo bg-superficie-2 p-4 text-sm">
              {mensagem}
            </pre>
          </details>

          <p className="mt-3 text-sm text-tinta-tenue">
            O link vale por 48 horas e trava depois que o professor confirmar.
          </p>
        </motion.div>
      )}
    </Cartao>
  )
}
