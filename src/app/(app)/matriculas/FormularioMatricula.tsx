'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { salvarMatricula } from './acoes'
import { avisoDeReposicao } from '@/dominio/matriculas/regras'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

interface Opcao {
  id: number
  nome: string
}

export function FormularioMatricula({
  alunos,
  turmas,
  alunoFixo,
  turmaFixa,
}: {
  alunos: Opcao[]
  turmas: Opcao[]
  alunoFixo?: number
  turmaFixa?: number
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])
  const hoje = new Date().toISOString().slice(0, 10)

  const [estado, setEstado] = useState({
    aluno_id: alunoFixo ?? null,
    turma_id: turmaFixa ?? null,
    data_inicio: hoje,
    data_fim: null as string | null,
    flag_reposicao: false,
  })

  const aviso = avisoDeReposicao(estado.flag_reposicao)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErros([])
    iniciar(async () => {
      const resultado = await salvarMatricula(estado)
      if (resultado.ok) {
        router.push(turmaFixa ? `/turmas/${turmaFixa}` : '/matriculas')
        router.refresh()
      } else {
        setErros(resultado.erros ?? ['Não foi possível matricular.'])
      }
    })
  }

  return (
    <form onSubmit={enviar} className="max-w-2xl">
      <Cartao className="flex flex-col gap-5">
        {!alunoFixo && (
          <Campo etiqueta="Aluno" obrigatorio>
            <select
              value={estado.aluno_id ?? ''}
              onChange={(e) =>
                setEstado((a) => ({ ...a, aluno_id: e.target.value ? Number(e.target.value) : null }))
              }
              className={entradaClasse}
            >
              <option value="">Selecione…</option>
              {alunos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {!turmaFixa && (
          <Campo etiqueta="Turma" ajuda="Somente turmas ativas aceitam matrícula." obrigatorio>
            <select
              value={estado.turma_id ?? ''}
              onChange={(e) =>
                setEstado((a) => ({ ...a, turma_id: e.target.value ? Number(e.target.value) : null }))
              }
              className={entradaClasse}
            >
              <option value="">Selecione…</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Data de início" obrigatorio>
            <input
              type="date"
              value={estado.data_inicio}
              onChange={(e) => setEstado((a) => ({ ...a, data_inicio: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
          <Campo etiqueta="Data de fim" ajuda="Deixe em branco para matrícula em aberto.">
            <input
              type="date"
              value={estado.data_fim ?? ''}
              onChange={(e) => setEstado((a) => ({ ...a, data_fim: e.target.value || null }))}
              className={entradaClasse}
            />
          </Campo>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={estado.flag_reposicao}
            onChange={(e) => setEstado((a) => ({ ...a, flag_reposicao: e.target.checked }))}
            className="size-5 accent-destaque"
          />
          <span className="font-medium">Matrícula de reposição</span>
        </label>

        <AnimatePresence>
          {aviso && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden rounded-campo bg-alerta-suave px-4 py-3 text-alerta"
            >
              {aviso}
            </motion.p>
          )}
        </AnimatePresence>
      </Cartao>

      {erros.length > 0 && (
        <ul role="alert" className="mt-4 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : 'Matricular'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
