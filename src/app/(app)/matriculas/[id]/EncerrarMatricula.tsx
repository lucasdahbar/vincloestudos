'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { encerrarMatricula } from '../acoes'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'

const br = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`

/**
 * Desmatricular pede confirmacao porque a acao muda cobranca e chamada a partir
 * da data de saida — e a gestora chega nesta tela vindo da turma, onde o clique
 * foi so "ver o aluno". A data e o primeiro dia sem o aluno (pedido do Julio,
 * 03/11/2026): ele pode ainda fazer algumas aulas antes de sair.
 */
export function EncerrarMatricula({ id, nome }: { id: number; nome: string }) {
  const router = useRouter()
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const [confirmando, setConfirmando] = useState(false)
  const [saida, setSaida] = useState(hoje)
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  // Decisao 11: o que a saida fez na cobranca (credito, item fora do rascunho).
  const [feito, setFeito] = useState<{ aviso: string; excluida: boolean } | null>(null)

  if (feito) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-campo bg-alerta-suave px-4 py-3 text-sm text-alerta">
        <p>{feito.aviso}</p>
        <div className="flex flex-wrap gap-3">
          <Botao type="button" onClick={() => {
              if (feito.excluida) router.push('/matriculas')
              else {
                setFeito(null)
                setConfirmando(false)
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

  const futura = saida > hoje
  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      <div className="max-w-xs">
        <Campo etiqueta="Sai a partir de" ajuda="O primeiro dia em que ele já não vem.">
          <input
            type="date"
            value={saida}
            onChange={(e) => {
              setSaida(e.target.value)
              setErro(null)
            }}
            className={entradaClasse}
          />
        </Campo>
      </div>
      <p className="text-sm text-erro">
        {saida === ''
          ? 'Informe a data de saída.'
          : `${nome}${futura ? ' continua nas aulas até a véspera e' : ''} deixa de aparecer nas aulas e nas cobranças a partir de ${br(saida)}. ` +
            'Aula já cobrada a partir dessa data vira crédito para o responsável; a que está só no rascunho sai dele. ' +
            'Você pode matriculá-lo de novo depois, se ele voltar.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <Botao
          type="button"
          disabled={pendente || saida === ''}
          onClick={() =>
            iniciar(async () => {
              try {
                const r = await encerrarMatricula(id, saida)
                if (!r.ok) {
                  setErro(
                    'recusada' in r && r.recusada
                      ? r.motivo
                      : 'Não foi possível desmatricular. Tente de novo ou fale com o suporte.',
                  )
                  return
                }
                const feitoTexto = futura
                  ? `${nome} sai a partir de ${br(saida)}.`
                  : `${nome} foi desmatriculado.`
                if (r.aviso || futura) {
                  // Sem refresh aqui: a tela da matricula encerrada esconde este
                  // componente, e o aviso sumiria antes de ser lido.
                  setFeito({ aviso: [feitoTexto, r.aviso].filter(Boolean).join(' '), excluida: r.excluida })
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
