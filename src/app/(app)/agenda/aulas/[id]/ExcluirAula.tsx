'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { consultarExclusaoAula, excluirAula } from '../../acoes'
import type { PreviaExclusaoAula } from '@/dados/exclusao-aula'
import type { Decisao } from '@/dominio/reposicoes/desfecho'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'
import { PerguntasDeCobranca } from '../../../reposicoes/PerguntasDeCobranca'

/** Valor do seletor para "não gerar reposição" (nenhuma aula tem esse id). */
const SEM_REPOSICAO = 'sem'

function semChave<T>(mapa: Record<string, T>, chave: string): Record<string, T> {
  return Object.fromEntries(Object.entries(mapa).filter(([k]) => k !== chave))
}

function resumoDaDecisao(d: Decisao): string {
  if (!d.cobrar) return 'Sem reposição e sem cobrar a aula. Se já foi cobrada, o valor vira crédito do responsável.'
  return d.pagarProfessor
    ? 'Sem reposição. A aula é cobrada e o professor recebe por ela (desistência paga).'
    : 'Sem reposição. A aula é cobrada.'
}

/**
 * Rodada 4 (spec 6.2), no mesmo desenho de ExcluirTurma: consulta primeiro,
 * mostra o que vai acontecer e só então pergunta. Com alunos, cada um escolhe
 * a aula de reposição ali mesmo, fica pendente ou fica sem reposição (pedido do
 * Julio, 01/11/2026), com as mesmas perguntas de cobrança do "avisou que não vem".
 */
export function ExcluirAula({ aulaId, quando }: { aulaId: number; quando: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [previa, setPrevia] = useState<PreviaExclusaoAula | null>(null)
  const [destinos, setDestinos] = useState<Record<string, number | null>>({})
  // Chave presente = "não gerar reposição"; null = a cobrança ainda não foi decidida.
  const [semReposicao, setSemReposicao] = useState<Record<string, Decisao | null>>({})
  const [excluida, setExcluida] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [erroAbrir, setErroAbrir] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function abrir() {
    setErros([])
    setErroAbrir(null)
    iniciar(async () => {
      try {
        const p = await consultarExclusaoAula(aulaId)
        if (!p) {
          setErroAbrir('Esta aula não existe mais. Volte para a agenda.')
          return
        }
        setPrevia(p)
        setDestinos({})
        setSemReposicao({})
        setExcluida(false)
        setAberto(true)
      } catch {
        setErroAbrir('Não foi possível verificar a aula agora. Tente de novo.')
      }
    })
  }

  function confirmar() {
    if (!previa || previa.avaliacao.tipo === 'bloqueada') return
    const av = previa.avaliacao
    const regulares =
      av.tipo === 'com-alunos'
        ? av.regulares.map((a) => ({
            aluno_id: a.aluno_id,
            aula_destino_id: destinos[`a${a.aluno_id}`] ?? null,
            sem_reposicao: semReposicao[`a${a.aluno_id}`] ?? undefined,
          }))
        : []
    const reposicoes =
      av.tipo === 'com-alunos'
        ? av.reposicoes.map((r) => ({
            pendencia_id: r.pendencia_id,
            aula_destino_id: destinos[`p${r.pendencia_id}`] ?? null,
            sem_reposicao: semReposicao[`p${r.pendencia_id}`] ?? undefined,
          }))
        : []

    const faltaDecidir = Object.values(semReposicao).some((d) => d === null)
    if (faltaDecidir) {
      setErros(['Responda se a aula será cobrada de quem ficou sem reposição.'])
      return
    }

    iniciar(async () => {
      try {
        const r = await excluirAula(aulaId, regulares, reposicoes)
        if (r.ok && r.avisos?.length) {
          // A aula já foi excluída; só a decisão de cobrança de alguém falhou.
          setExcluida(true)
          setErros(r.avisos)
          router.refresh()
        } else if (r.ok) {
          setAberto(false)
          router.push('/agenda')
          router.refresh()
        } else {
          setErros(r.erros ?? ['Não foi possível excluir a aula.'])
        }
      } catch {
        setErros(['Não foi possível excluir a aula agora. Tente de novo.'])
      }
    })
  }

  const av = previa?.avaliacao
  const seletor = (chave: string, nome: string) => {
    const sem = chave in semReposicao
    const decisao = semReposicao[chave]
    return (
      <div key={chave} className="flex flex-col gap-1 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium">{nome}</span>
          <select
            className={entradaClasse}
            value={sem ? SEM_REPOSICAO : (destinos[chave] ?? '')}
            onChange={(e) => {
              const v = e.target.value
              setSemReposicao((s) => (v === SEM_REPOSICAO ? { ...s, [chave]: null } : semChave(s, chave)))
              setDestinos((d) => ({ ...d, [chave]: v && v !== SEM_REPOSICAO ? Number(v) : null }))
            }}
          >
            <option value="">Deixar a reposição pendente</option>
            <option value={SEM_REPOSICAO}>Não gerar reposição</option>
            {previa?.destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </label>
        {sem && decisao === null && (
          <PerguntasDeCobranca
            pendente={false}
            onDecidir={(d) => setSemReposicao((s) => ({ ...s, [chave]: d }))}
            onVoltar={() => setSemReposicao((s) => semChave(s, chave))}
          />
        )}
        {sem && decisao && (
          <span className="text-tinta-suave">
            {resumoDaDecisao(decisao)}{' '}
            <button
              type="button"
              className="font-medium text-destaque underline-offset-4 hover:underline"
              onClick={() => setSemReposicao((s) => ({ ...s, [chave]: null }))}
            >
              Alterar
            </button>
          </span>
        )}
      </div>
    )
  }

  return (
    <>
      <Botao aparencia="perigo" type="button" disabled={pendente} onClick={abrir}>
        {pendente && !aberto ? 'Verificando…' : 'Excluir esta aula'}
      </Botao>
      {erroAbrir && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erroAbrir}
        </p>
      )}

      <AnimatePresence>
        {aberto && av && (
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
              aria-labelledby="titulo-exclusao-aula"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-painel border border-borda bg-superficie p-6 shadow-elevado"
            >
              <h2 id="titulo-exclusao-aula" className="text-xl">
                {av.tipo === 'bloqueada' ? 'Esta aula não pode ser excluída' : `Excluir a aula de ${quando}?`}
              </h2>

              {av.tipo === 'bloqueada' && <p className="mt-3 text-tinta-suave">{av.motivo}</p>}

              {av.tipo === 'sem-alunos' && (
                <p className="mt-3 text-tinta-suave">
                  Ninguém está matriculado nesta aula. Ela sai da agenda do sistema e da agenda do
                  professor no Google.
                </p>
              )}

              {av.tipo === 'com-alunos' && (
                <div className="mt-3 flex flex-col gap-4">
                  <p className="text-tinta-suave">
                    Antes de excluir, diga o que fazer com cada aluno: marcar a reposição, deixar
                    pendente (aparece em Reposições) ou não gerar reposição, caso em que você decide
                    se a aula é cobrada, como no &quot;avisou que não vem&quot;. A reposição marcada não
                    gera cobrança nova.
                  </p>
                  {av.regulares.map((a) => seletor(`a${a.aluno_id}`, a.nome))}
                  {av.reposicoes.length > 0 && (
                    <p className="text-sm text-tinta-suave">Estavam repondo nesta aula:</p>
                  )}
                  {av.reposicoes.map((r) => seletor(`p${r.pendencia_id}`, r.nome))}
                </div>
              )}

              {erros.length > 0 && (
                <ul role="alert" className="mt-3 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
                  {erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {av.tipo === 'bloqueada' ? (
                  <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                    Entendi
                  </Botao>
                ) : (
                  excluida ? (
                    <Botao
                      aparencia="secundario"
                      onClick={() => {
                        setAberto(false)
                        router.push('/agenda')
                      }}
                    >
                      Ir para a agenda
                    </Botao>
                  ) : (
                    <>
                      <Botao aparencia="perigo" disabled={pendente} onClick={confirmar}>
                        {pendente ? 'Excluindo…' : 'Sim, excluir a aula'}
                      </Botao>
                      <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                        Cancelar
                      </Botao>
                    </>
                  )
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
