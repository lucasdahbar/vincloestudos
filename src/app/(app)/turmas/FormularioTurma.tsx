'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { salvarTurma } from './acoes'
import { gerarNomeTurma } from '@/dominio/turmas/nome'
import {
  DIAS_SEMANA,
  MODALIDADES,
  type Modalidade,
  type TipoRecorrencia,
} from '@/dominio/tipos'
import type { EntradaTurma } from '@/dominio/turmas/regras'
import type { OpcoesDeTurma, TurmaComRelacoes } from '@/dados/turmas'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

export function FormularioTurma({
  opcoes,
  turma,
}: {
  opcoes: OpcoesDeTurma
  turma?: TurmaComRelacoes
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])

  const [estado, setEstado] = useState<EntradaTurma>(() => ({
    servico_id: turma?.servico_id ?? null,
    materia_id: turma?.materia_id ?? null,
    escola_id: turma?.escola_id ?? null,
    ano_escolar_id: turma?.ano_escolar_id ?? null,
    professor_id: turma?.professor_id ?? null,
    modalidade: turma?.modalidade ?? null,
    tipo_recorrencia: turma?.tipo_recorrencia ?? 'Recorrente',
    data_unica: turma?.data_unica ?? null,
    dias_semana: turma?.dias_semana ?? [],
    horario_inicio: turma?.horario_inicio?.slice(0, 5) ?? '',
    horario_fim: turma?.horario_fim?.slice(0, 5) ?? '',
    status: turma?.status ?? 'Ativa',
  }))

  const servico = opcoes.servicos.find((s) => s.id === estado.servico_id) ?? null

  const nomes = useMemo(
    () => ({
      materia: opcoes.materias.find((m) => m.id === estado.materia_id)?.nome ?? null,
      anoEscolar: opcoes.anosEscolares.find((a) => a.id === estado.ano_escolar_id)?.nome ?? null,
      escola: opcoes.escolas.find((e) => e.id === estado.escola_id)?.nome ?? null,
      servico: servico?.nome ?? null,
    }),
    [estado, opcoes, servico],
  )

  const nomeGerado = gerarNomeTurma({ ...nomes, modalidade: estado.modalidade })

  /** Trocar de servico limpa os campos que o novo servico nao usa. */
  function escolherServico(id: number | null) {
    const novo = opcoes.servicos.find((s) => s.id === id) ?? null
    setEstado((atual) => ({
      ...atual,
      servico_id: id,
      materia_id: novo?.permite_materia ? atual.materia_id : null,
      escola_id: novo?.permite_escola ? atual.escola_id : null,
    }))
  }

  /** Trocar de modo limpa o campo do modo anterior: os dois nunca coexistem. */
  function trocarRecorrencia(tipo: TipoRecorrencia) {
    setEstado((atual) => ({
      ...atual,
      tipo_recorrencia: tipo,
      dias_semana: tipo === 'Único' ? [] : atual.dias_semana,
      data_unica: tipo === 'Recorrente' ? null : atual.data_unica,
    }))
  }

  function alternarDia(dia: number) {
    setEstado((atual) => ({
      ...atual,
      dias_semana: atual.dias_semana.includes(dia)
        ? atual.dias_semana.filter((d) => d !== dia)
        : [...atual.dias_semana, dia].sort((a, b) => a - b),
    }))
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErros([])
    iniciar(async () => {
      const resultado = await salvarTurma(turma?.id ?? null, estado, nomes)
      if (resultado.ok) {
        router.push(`/turmas/${resultado.id}`)
        router.refresh()
      } else {
        setErros(resultado.erros ?? ['Não foi possível salvar a turma.'])
      }
    })
  }

  return (
    <form onSubmit={enviar} className="max-w-2xl">
      <Cartao className="flex flex-col gap-5">
        <div className="rounded-campo bg-superficie-2 px-4 py-3">
          <span className="text-sm text-tinta-suave">Nome da turma (gerado automaticamente)</span>
          <motion.p
            key={nomeGerado}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="mt-1 font-titulo text-lg"
          >
            {nomeGerado || 'Preencha os campos abaixo…'}
          </motion.p>
        </div>

        <Campo etiqueta="Serviço" obrigatorio>
          <select
            value={estado.servico_id ?? ''}
            onChange={(e) => escolherServico(e.target.value ? Number(e.target.value) : null)}
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {opcoes.servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </Campo>

        <AnimatePresence initial={false}>
          {servico?.permite_materia && (
            <motion.div
              key="materia"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Campo etiqueta="Matéria" obrigatorio>
                <select
                  value={estado.materia_id ?? ''}
                  onChange={(e) =>
                    setEstado((a) => ({
                      ...a,
                      materia_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className={entradaClasse}
                >
                  <option value="">Selecione…</option>
                  {opcoes.materias.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </motion.div>
          )}

          {servico?.permite_escola && (
            <motion.div
              key="escola"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Campo etiqueta="Escola" obrigatorio>
                <select
                  value={estado.escola_id ?? ''}
                  onChange={(e) =>
                    setEstado((a) => ({
                      ...a,
                      escola_id: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className={entradaClasse}
                >
                  <option value="">Selecione…</option>
                  {opcoes.escolas.map((e2) => (
                    <option key={e2.id} value={e2.id}>
                      {e2.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </motion.div>
          )}
        </AnimatePresence>

        <Campo etiqueta="Ano escolar" obrigatorio>
          <select
            value={estado.ano_escolar_id ?? ''}
            onChange={(e) =>
              setEstado((a) => ({
                ...a,
                ano_escolar_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {opcoes.anosEscolares.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Professor responsável" obrigatorio>
          <select
            value={estado.professor_id ?? ''}
            onChange={(e) =>
              setEstado((a) => ({
                ...a,
                professor_id: e.target.value ? Number(e.target.value) : null,
              }))
            }
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {opcoes.professores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="Modalidade" obrigatorio>
          <select
            value={estado.modalidade ?? ''}
            onChange={(e) =>
              setEstado((a) => ({ ...a, modalidade: (e.target.value || null) as Modalidade }))
            }
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {MODALIDADES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>

        {/* T1: mesma escolha do Google Agenda — "não se repete" ou "recorrente".
            Cobre o aulão de revisão sem precisar de um segundo cadastro. */}
        <Campo etiqueta="Repetição" obrigatorio>
          <div className="flex flex-wrap gap-2">
            {(['Recorrente', 'Único'] as TipoRecorrencia[]).map((tipo) => {
              const marcado = estado.tipo_recorrencia === tipo
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => trocarRecorrencia(tipo)}
                  aria-pressed={marcado}
                  className={`min-h-[44px] rounded-campo border px-4 font-medium transition-all active:scale-95 ${
                    marcado
                      ? 'border-destaque bg-destaque text-white'
                      : 'border-borda bg-superficie text-tinta-suave hover:border-destaque/40'
                  }`}
                >
                  {tipo === 'Recorrente' ? 'Toda semana' : 'Não se repete'}
                </button>
              )
            })}
          </div>
        </Campo>

        {estado.tipo_recorrencia === 'Único' ? (
          <Campo etiqueta="Data da aula" ajuda="Esta turma acontece uma vez só." obrigatorio>
            <input
              type="date"
              value={estado.data_unica ?? ''}
              onChange={(e) => setEstado((a) => ({ ...a, data_unica: e.target.value || null }))}
              className={entradaClasse}
            />
          </Campo>
        ) : (
          <Campo
            etiqueta="Dias da semana"
            ajuda="Em quais dias esta turma tem aula."
            obrigatorio
          >
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map((dia) => {
                const marcado = estado.dias_semana.includes(dia.valor)
                return (
                  <button
                    key={dia.valor}
                    type="button"
                    onClick={() => alternarDia(dia.valor)}
                    aria-pressed={marcado}
                    className={`min-h-[44px] min-w-[56px] rounded-campo border px-3 font-medium transition-all active:scale-95 ${
                      marcado
                        ? 'border-destaque bg-destaque text-white'
                        : 'border-borda bg-superficie text-tinta-suave hover:border-destaque/40'
                    }`}
                  >
                    {dia.curto}
                  </button>
                )
              })}
            </div>
          </Campo>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Início" obrigatorio>
            <input
              type="time"
              value={estado.horario_inicio}
              onChange={(e) => setEstado((a) => ({ ...a, horario_inicio: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
          <Campo etiqueta="Término" obrigatorio>
            <input
              type="time"
              value={estado.horario_fim}
              onChange={(e) => setEstado((a) => ({ ...a, horario_fim: e.target.value }))}
              className={entradaClasse}
            />
          </Campo>
        </div>
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
          {pendente ? 'Salvando…' : 'Salvar turma'}
        </Botao>
        <Botao type="button" aparencia="secundario" onClick={() => router.back()}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
