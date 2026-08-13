'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { CampoDinamico, type OpcaoReferencia } from './CampoDinamico'
import { salvarCadastro } from './acoes'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entrada } from '@/ui/animacoes'
import { valoresIniciais, type DefinicaoCadastro } from '@/cadastros/tipos'

interface Props {
  definicao: DefinicaoCadastro
  registro?: Record<string, unknown> & { id: number }
  referencias: Record<string, OpcaoReferencia[]>
}

export function Formulario({ definicao, registro, referencias }: Props) {
  const router = useRouter()
  const [valores, setValores] = useState(() => valoresIniciais(definicao, registro))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function mudar(nome: string, valor: unknown) {
    setValores((atual) => ({ ...atual, [nome]: valor }))
    setErros(({ [nome]: _removido, ...resto }) => resto)
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setMensagem(null)

    iniciar(async () => {
      const resultado = await salvarCadastro(definicao.rota, registro?.id ?? null, valores)
      if (resultado.ok) {
        router.push(`/cadastros/${definicao.rota}`)
        router.refresh()
      } else {
        setErros(resultado.errosPorCampo ?? {})
        setMensagem(resultado.mensagem ?? 'Não foi possível salvar.')
      }
    })
  }

  return (
    <motion.form
      variants={entrada}
      initial="oculto"
      animate="visivel"
      onSubmit={enviar}
      className="max-w-2xl"
    >
      <Cartao className="flex flex-col gap-5">
        {definicao.campos.map((campo) => (
          <CampoDinamico
            key={campo.nome}
            campo={campo}
            valor={valores[campo.nome]}
            erro={erros[campo.nome]}
            referencias={referencias}
            aoMudar={mudar}
          />
        ))}
      </Cartao>

      {mensagem && (
        <p role="alert" className="mt-4 rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {mensagem}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
      </div>
    </motion.form>
  )
}
