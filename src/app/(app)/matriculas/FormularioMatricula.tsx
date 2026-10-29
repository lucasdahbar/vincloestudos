'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { anteciparMatricula, salvarMatricula } from './acoes'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { avisoDeReposicao } from '@/dominio/matriculas/regras'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

interface Opcao {
  id: number
  nome: string
}

/** T3: quando `matricula` vem preenchida, o formulario edita em vez de criar. */
export interface MatriculaExistente {
  id: number
  aluno_id: number
  turma_id: number
  data_inicio: string
  data_fim: string | null
  flag_reposicao: boolean
}

export function FormularioMatricula({
  alunos,
  turmas,
  alunoFixo,
  turmaFixa,
  matricula,
  inicio,
  fim,
  voltarPara,
}: {
  alunos: Opcao[]
  turmas: Opcao[]
  alunoFixo?: number
  turmaFixa?: number
  matricula?: MatriculaExistente
  /** Vindo da tela da aula na agenda: a data da aula, e o fim igual na aula avulsa. */
  inicio?: string
  fim?: string
  /** Para onde voltar depois de matricular (a propria aula). */
  voltarPara?: string
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])
  const [antecipar, setAntecipar] = useState<{ id: number; data_inicio: string } | null>(null)
  // Decisao 11: a edicao gravou e mexeu na cobranca; a gestora le antes de sair.
  const [feito, setFeito] = useState<string | null>(null)
  // No relogio da escola: em UTC, depois das 21h o padrao ja seria amanha.
  const hoje = agoraNaEscola(new Date()).slice(0, 10)

  const [estado, setEstado] = useState({
    aluno_id: matricula?.aluno_id ?? alunoFixo ?? null,
    turma_id: matricula?.turma_id ?? turmaFixa ?? null,
    data_inicio: matricula?.data_inicio ?? inicio ?? hoje,
    data_fim: matricula?.data_fim ?? fim ?? (null as string | null),
    flag_reposicao: matricula?.flag_reposicao ?? false,
  })

  const aviso = avisoDeReposicao(estado.flag_reposicao)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    gravar(() => salvarMatricula(estado, matricula?.id ?? null))
  }

  function sair() {
    router.push(
      matricula ? `/turmas/${estado.turma_id}` : (voltarPara ?? (turmaFixa ? `/turmas/${turmaFixa}` : '/matriculas')),
    )
    router.refresh()
  }

  function gravar(acao: () => ReturnType<typeof salvarMatricula>) {
    setErros([])
    setAntecipar(null)
    iniciar(async () => {
      const resultado = await acao()
      if (resultado.antecipar) {
        setAntecipar(resultado.antecipar)
      } else if (resultado.ok && resultado.aviso) {
        setFeito(resultado.aviso)
      } else if (resultado.ok) {
        sair()
      } else {
        setErros(resultado.erros ?? ['Não foi possível matricular.'])
      }
    })
  }

  return (
    <form onSubmit={enviar} className="max-w-2xl">
      <Cartao className="flex flex-col gap-5">
        {!alunoFixo && !matricula && (
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

        {!turmaFixa && !matricula && (
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

      {feito && (
        <div role="status" className="mt-4 flex flex-col gap-3 rounded-campo bg-alerta-suave px-4 py-3 text-alerta">
          <p>Matrícula salva. {feito}</p>
          <div>
            <Botao type="button" onClick={sair}>
              Continuar
            </Botao>
          </div>
        </div>
      )}

      {erros.length > 0 && (
        <ul role="alert" className="mt-4 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}

      {antecipar && (
        <div role="alert" className="mt-4 flex flex-col gap-3 rounded-campo bg-alerta-suave px-4 py-3 text-alerta">
          <p>
            Este aluno já está matriculado nesta turma a partir de {dataBR(antecipar.data_inicio)}. Em vez de
            criar outra matrícula, antecipe o início da que já existe: assim o nome não aparece duas vezes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Botao
              type="button"
              disabled={pendente}
              onClick={() => gravar(() => anteciparMatricula(antecipar.id, estado.data_inicio))}
            >
              Antecipar início para {dataBR(estado.data_inicio)}
            </Botao>
            <Botao
              type="button"
              aparencia="secundario"
              disabled={pendente}
              onClick={() => gravar(() => salvarMatricula(estado, null, true))}
            >
              Criar matrícula separada mesmo assim
            </Botao>
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <Botao type="submit" disabled={pendente}>
          {pendente ? 'Salvando…' : matricula ? 'Salvar alterações' : 'Matricular'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}

function dataBR(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}
