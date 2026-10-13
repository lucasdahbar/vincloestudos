'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { consultarEncerramento, encerrarTurma } from '../acoes'
import type { PreviaEncerramento } from '@/dados/encerramento'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'
import { somarDias } from '@/dominio/agenda/recorrencia'

/** Hoje no relógio da escola, no navegador. */
const hojeNaEscola = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const ddmmaaaa = (iso: string) => iso.split('-').reverse().join('/')

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Encerrar turma (pedido do tio, 13/10/2026). Mesmo desenho do ExcluirTurma:
 * consulta primeiro, mostra o que vai acontecer — ou o que impede — e só então
 * pergunta. A recorrente pede a data a partir da qual não há mais aula; a aula
 * única não pede (o sistema decide pela aula ter acontecido ou não).
 */
export function EncerrarTurma({
  id,
  nome,
  unica,
  fimAtual,
}: {
  id: number
  nome: string
  unica: boolean
  /** Último dia da turma recorrente hoje, em ISO. */
  fimAtual: string | null
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  // Turma cujo fim marcado já passou: o encerramento natural é no dia seguinte
  // a ele. Hoje estenderia a turma, e o sistema recusaria.
  const [data, setData] = useState(() => {
    const hoje = hojeNaEscola()
    return fimAtual && fimAtual < hoje ? somarDias(fimAtual, 1) : hoje
  })
  const [previa, setPrevia] = useState<PreviaEncerramento | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [pendente, iniciar] = useTransition()
  // Só vale a resposta da última consulta: trocar a data no meio de uma
  // consulta não pode mostrar a prévia da data antiga.
  const consulta = useRef(0)

  function verificar(dataEscolhida: string | null) {
    setErros([])
    const minha = ++consulta.current
    iniciar(async () => {
      try {
        const r = await consultarEncerramento(id, dataEscolhida)
        if (minha === consulta.current) setPrevia(r)
      } catch {
        if (minha !== consulta.current) return
        setPrevia(null)
        setErros(['Não foi possível conferir a turma agora. Tente de novo.'])
      }
    })
  }

  function abrir() {
    setPrevia(null)
    setErros([])
    setAberto(true)
    // A aula única não tem data a escolher: já consulta.
    if (unica) verificar(null)
  }

  function confirmar() {
    if (previa?.tipo !== 'avaliada' || !previa.avaliacao.pode) return
    iniciar(async () => {
      try {
        const r = await encerrarTurma(id, unica ? null : previa.data)
        if (r.ok) {
          setAberto(false)
          router.refresh()
        } else {
          setErros(r.erros ?? ['Não foi possível encerrar a turma.'])
        }
      } catch {
        setErros(['Não foi possível encerrar a turma agora. Tente de novo.'])
      }
    })
  }

  const avaliada = previa?.tipo === 'avaliada' ? previa : null
  const podeEncerrar = avaliada?.avaliacao.pode === true

  return (
    <>
      <Botao aparencia="secundario" type="button" onClick={abrir}>
        Encerrar turma
      </Botao>

      <AnimatePresence>
        {aberto && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-tinta/30"
              onClick={() => setAberto(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-encerrar-turma"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-painel border border-borda bg-superficie p-6 shadow-elevado"
            >
              <h2 id="titulo-encerrar-turma" className="text-xl">
                Encerrar {nome}?
              </h2>

              {!unica && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Sem aula a partir de</span>
                    <input
                      type="date"
                      value={data}
                      onChange={(e) => {
                        setData(e.target.value)
                        setPrevia(null)
                        consulta.current++
                      }}
                      className={entradaClasse}
                    />
                  </label>
                  <Botao
                    aparencia="secundario"
                    type="button"
                    disabled={pendente || !data}
                    onClick={() => verificar(data)}
                  >
                    {pendente && !previa ? 'Verificando…' : 'Verificar'}
                  </Botao>
                </div>
              )}

              {previa?.tipo === 'invalida' && (
                <p role="alert" className="mt-4 text-erro">
                  {previa.motivo}
                </p>
              )}

              {avaliada && !avaliada.avaliacao.pode && (
                <div role="alert" className="mt-4 rounded-campo bg-alerta-suave px-4 py-3 text-sm">
                  <p className="font-medium">Ainda não dá para encerrar:</p>
                  <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                    {avaliada.avaliacao.motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}

              {avaliada?.avaliacao.pode && (
                <ul className="mt-4 flex list-disc flex-col gap-1 pl-5 text-tinta-suave">
                  {avaliada.unica ? (
                    <li>
                      {avaliada.avaliacao.aulasQueSaem > 0
                        ? 'A aula sai da agenda do sistema e da agenda do professor.'
                        : 'Nenhuma aula sai da agenda: a turma só passa a constar como encerrada.'}
                    </li>
                  ) : (
                    <li>
                      A última aula fica em {ddmmaaaa(avaliada.avaliacao.vespera)} ou antes.{' '}
                      {avaliada.avaliacao.aulasQueSaem > 0
                        ? `${plural(avaliada.avaliacao.aulasQueSaem, 'aula sai', 'aulas saem')} da agenda do sistema e do professor (a partir de ${ddmmaaaa(avaliada.data)}).`
                        : 'Nenhuma aula já lançada sai da agenda.'}
                    </li>
                  )}
                  {avaliada.avaliacao.alunos > 0 && (
                    <li>
                      {plural(avaliada.avaliacao.alunos, 'aluno é desmatriculado', 'alunos são desmatriculados')}{' '}
                      a partir de {ddmmaaaa(avaliada.data)}.
                    </li>
                  )}
                  {avaliada.avaliacao.itensDeRascunho > 0 && (
                    <li>
                      {plural(avaliada.avaliacao.itensDeRascunho, 'aula sai', 'aulas saem')} de
                      cobranças em rascunho, e o total é recalculado.
                    </li>
                  )}
                  {!avaliada.unica && avaliada.data > hojeNaEscola() && (
                    <li>
                      Como a data ainda não chegou, a turma segue ativa, com aulas até{' '}
                      {ddmmaaaa(avaliada.avaliacao.vespera)}.
                    </li>
                  )}
                </ul>
              )}

              {erros.length > 0 && (
                <ul role="alert" className="mt-4 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
                  {erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {podeEncerrar && (
                  <Botao aparencia="perigo" disabled={pendente} onClick={confirmar}>
                    {pendente ? 'Encerrando…' : 'Sim, encerrar'}
                  </Botao>
                )}
                {unica && !podeEncerrar && (
                  <Botao aparencia="secundario" disabled={pendente} onClick={() => verificar(null)}>
                    {pendente ? 'Verificando…' : 'Verificar de novo'}
                  </Botao>
                )}
                <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                  {podeEncerrar ? 'Cancelar' : 'Fechar'}
                </Botao>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
