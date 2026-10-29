'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { encerrarMatricula } from '../acoes'
import { Botao } from '@/ui/Botao'

/**
 * Desmatricular pede confirmacao porque a acao muda cobranca e chamada a partir
 * de hoje — e a gestora chega nesta tela vindo da turma, onde o clique foi so
 * "ver o aluno".
 */
export function EncerrarMatricula({ id, nome }: { id: number; nome: string }) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  // Decisao 11: o que a saida fez na cobranca (credito, item fora do rascunho).
  const [feito, setFeito] = useState<{ aviso: string; excluida: boolean } | null>(null)

  if (feito) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-campo bg-alerta-suave px-4 py-3 text-sm text-alerta">
        <p>{nome} foi desmatriculado. {feito.aviso}</p>
        <div className="flex flex-wrap gap-3">
          <Botao type="button" onClick={() => {
              if (feito.excluida) router.push('/matriculas')
              else {
                setFeito(null)
                router.refresh()
              }
            }}>
            Entendi
          </Botao>
          <Botao type="button" aparencia="secundario" onClick={() => router.push('/creditos')}>
            Ver créditos
          </Botao>
        </div>
      </div>
    )
  }

  if (!confirmando) {
    return (
      <Botao type="button" aparencia="secundario" onClick={() => setConfirmando(true)}>
        Desmatricular {nome.split(' ')[0]}
      </Botao>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      <p className="text-sm text-erro">
        {nome} deixa de aparecer nas aulas e nas cobranças a partir de hoje. Aula já cobrada
        depois de hoje vira crédito para o responsável. Você pode matriculá-lo de novo depois,
        se ele voltar.
      </p>
      <div className="flex flex-wrap gap-3">
        <Botao
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              try {
                const r = await encerrarMatricula(id)
                if (!r.ok) {
                  setErro('Não foi possível desmatricular. Tente de novo ou fale com o suporte.')
                  return
                }
                if (r.aviso) {
                  // Sem refresh aqui: a tela da matricula encerrada esconde este
                  // componente, e o aviso sumiria antes de ser lido.
                  setFeito({ aviso: r.aviso, excluida: r.excluida })
                }
                // A matricula que ainda nao tinha comecado e excluida: esta tela deixa de existir.
                else if (r.excluida) router.push('/matriculas')
                else router.refresh()
              } catch (e) {
                setErro(e instanceof Error ? e.message : 'Não foi possível desmatricular.')
              }
            })
          }
        >
          {pendente ? 'Desmatriculando…' : 'Sim, desmatricular'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => setConfirmando(false)}>
          Cancelar
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erro}
        </p>
      )}
    </motion.div>
  )
}
