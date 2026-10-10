'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { salvarTurma } from './acoes'
import { gerarNomeTurma } from '@/dominio/turmas/nome'
import {
  DIAS_SEMANA,
  MODALIDADES,
  type Frequencia,
  type Modalidade,
} from '@/dominio/tipos'
import type { EntradaTurma } from '@/dominio/turmas/regras'
import {
  datasDaRegra,
  fimAutomatico,
  opcaoDaRegra,
  regraDaOpcao,
  textoDaRegra,
  type OpcaoRepeticao,
} from '@/dominio/agenda/recorrencia'
import { alertaDaData, datasPuladas } from '@/dominio/agenda/datas-puladas'
import type { OpcoesDeTurma, TurmaComRelacoes } from '@/dados/turmas'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

/** Hoje no relógio da escola, no navegador. */
const hojeNaEscola = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const ddmmaaaa = (iso: string) => iso.split('-').reverse().join('/')

const ROTULO_OPCAO: Record<OpcaoRepeticao, string> = {
  Único: 'Não se repete',
  Diário: 'Diário (seg a sex)',
  Semanal: 'Semanal',
  Quinzenal: 'Quinzenal',
  Mensal: 'Mensal',
  Personalizado: 'Personalizado',
}

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
    frequencia: turma?.frequencia ?? 'Semanal',
    intervalo: turma?.intervalo ?? 1,
    data_inicio: turma?.data_inicio ?? hojeNaEscola(),
    // Fim automático aparece vazio: o sistema decide ao salvar.
    data_fim: turma && !turma.fim_automatico ? turma.data_fim : null,
    dias_semana: turma?.dias_semana ?? [],
    horario_inicio: turma?.horario_inicio?.slice(0, 5) ?? '',
    horario_fim: turma?.horario_fim?.slice(0, 5) ?? '',
    status: turma?.status ?? 'Ativa',
    link_videochamada: turma?.link_videochamada ?? null,
  }))

  const [opcao, setOpcao] = useState<OpcaoRepeticao>(() =>
    opcaoDaRegra({
      tipo_recorrencia: turma?.tipo_recorrencia ?? 'Recorrente',
      frequencia: turma?.frequencia ?? 'Semanal',
      intervalo: turma?.intervalo ?? 1,
      dias_semana: turma?.dias_semana ?? [],
    }),
  )
  const [confirmouData, setConfirmouData] = useState(false)

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

  const recorrente = estado.tipo_recorrencia === 'Recorrente'
  const automatico = estado.data_inicio ? fimAutomatico(hojeNaEscola(), estado.data_inicio) : null
  // Turma renovada: o fim automático salvo pode ser posterior ao do ano corrente.
  const fimPrevisto =
    estado.data_fim ??
    (automatico && turma?.fim_automatico && turma.data_fim && turma.data_fim > automatico
      ? turma.data_fim
      : automatico)

  const mostraDias =
    opcao === 'Semanal' || opcao === 'Quinzenal' || (opcao === 'Personalizado' && estado.frequencia === 'Semanal')
  const faltaDia = recorrente && mostraDias && estado.dias_semana.length === 0

  // Rodada 4: o que a gestora vai lançar, antes de salvar.
  const resumo = useMemo(() => {
    if (!recorrente || faltaDia || !estado.data_inicio || !fimPrevisto || !estado.frequencia) return null
    if (!estado.intervalo || estado.intervalo < 1 || fimPrevisto < estado.data_inicio) return null
    // Digitando o ano, o navegador emite datas intermediárias (0202-10-09): não calcula.
    const anoIni = Number(estado.data_inicio.slice(0, 4))
    const anoFim = Number(fimPrevisto.slice(0, 4))
    if (anoIni < 2000 || anoFim < 2000 || anoFim - anoIni > 3) return null
    const regra = {
      frequencia: estado.frequencia,
      intervalo: estado.intervalo,
      dias_semana: estado.dias_semana,
      data_inicio: estado.data_inicio,
      data_fim: fimPrevisto,
    }
    const datas = datasDaRegra(regra, regra.data_inicio, regra.data_fim)
    const puladas = datasPuladas(estado.escola_id, opcoes.feriados, opcoes.recessos, regra.data_inicio, regra.data_fim)
    const pulam = datas.filter((d) => puladas.has(d)).length
    return { texto: textoDaRegra(regra), de: regra.data_inicio, ate: regra.data_fim, aulas: datas.length - pulam, pulam }
  }, [recorrente, faltaDia, estado, fimPrevisto, opcoes.feriados, opcoes.recessos])

  const alerta =
    !recorrente && estado.data_unica
      ? alertaDaData(estado.data_unica, estado.escola_id, opcoes.feriados, opcoes.recessos)
      : null

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

  /** Cada opção pronta grava uma regra; trocar de modo limpa o modo anterior. */
  function escolherOpcao(nova: OpcaoRepeticao) {
    setOpcao(nova)
    setConfirmouData(false)
    setEstado((atual) => {
      if (nova === 'Único') return { ...atual, tipo_recorrencia: 'Único', dias_semana: [] }
      const base = { ...atual, tipo_recorrencia: 'Recorrente' as const, data_unica: null }
      if (nova === 'Personalizado') {
        return { ...base, frequencia: atual.frequencia ?? 'Semanal', intervalo: atual.intervalo ?? 1 }
      }
      return { ...base, ...regraDaOpcao(nova, atual.dias_semana) }
    })
  }

  function escolherUnidade(frequencia: Frequencia) {
    setEstado((a) => ({ ...a, frequencia, dias_semana: frequencia === 'Semanal' ? a.dias_semana : [] }))
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
    // Spec 4.3: aula única em feriado só com a confirmação da gestora.
    if (alerta && !confirmouData) {
      setErros(['Confirme que a aula vai acontecer mesmo assim, ou escolha outra data.'])
      return
    }
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

        {/* Rodada 4: como um compromisso no Google Agenda — não se repete,
            diário, semanal, quinzenal, mensal ou "a cada N". */}
        <Campo etiqueta="Repetição" obrigatorio grupo>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ROTULO_OPCAO) as OpcaoRepeticao[]).map((op) => {
              const marcado = opcao === op
              return (
                <button
                  key={op}
                  type="button"
                  onClick={() => escolherOpcao(op)}
                  aria-pressed={marcado}
                  className={`min-h-[44px] rounded-campo border px-4 font-medium transition-all active:scale-95 ${
                    marcado
                      ? 'border-destaque bg-destaque text-white'
                      : 'border-borda bg-superficie text-tinta-suave hover:border-destaque/40'
                  }`}
                >
                  {ROTULO_OPCAO[op]}
                </button>
              )
            })}
          </div>
        </Campo>

        {!recorrente ? (
          <>
            <Campo etiqueta="Data da aula" ajuda="Esta turma acontece uma vez só." obrigatorio>
              <input
                type="date"
                value={estado.data_unica ?? ''}
                onChange={(e) => {
                  setConfirmouData(false)
                  setEstado((a) => ({ ...a, data_unica: e.target.value || null }))
                }}
                className={entradaClasse}
              />
            </Campo>
            {alerta && (
              <div role="alert" className="rounded-campo bg-alerta-suave px-4 py-3 text-sm">
                <p>{alerta}</p>
                <label className="mt-2 flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={confirmouData}
                    onChange={(e) => setConfirmouData(e.target.checked)}
                  />
                  Criar a aula nesta data mesmo assim
                </label>
              </div>
            )}
          </>
        ) : (
          <>
            {opcao === 'Personalizado' && (
              <Campo etiqueta="Repete a cada" obrigatorio grupo>
                <div className="flex gap-2">
                  <input
                    aria-label="Intervalo"
                    type="number"
                    min={1}
                    max={99}
                    value={estado.intervalo ?? ''}
                    onChange={(e) =>
                      setEstado((a) => ({ ...a, intervalo: e.target.value ? Number(e.target.value) : null }))
                    }
                    className={`${entradaClasse} w-24`}
                  />
                  <select
                    aria-label="Unidade"
                    value={estado.frequencia ?? 'Semanal'}
                    onChange={(e) => escolherUnidade(e.target.value as Frequencia)}
                    className={entradaClasse}
                  >
                    <option value="Diária">dias</option>
                    <option value="Semanal">semanas</option>
                    <option value="Mensal">meses</option>
                  </select>
                </div>
              </Campo>
            )}

            {mostraDias && (
              <Campo etiqueta="Dias da semana" ajuda="Em quais dias esta turma tem aula." obrigatorio grupo>
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
              <Campo etiqueta="Começa em" ajuda="Pode ser uma data passada." obrigatorio>
                <input
                  type="date"
                  value={estado.data_inicio ?? ''}
                  onChange={(e) => setEstado((a) => ({ ...a, data_inicio: e.target.value || null }))}
                  className={entradaClasse}
                />
              </Campo>
              <Campo
                etiqueta="Termina em"
                ajuda={`Sem data, a turma vai até ${fimPrevisto && !estado.data_fim ? ddmmaaaa(fimPrevisto) : '31/12'}.`}
              >
                <input
                  type="date"
                  value={estado.data_fim ?? ''}
                  min={estado.data_inicio ?? undefined}
                  onChange={(e) => setEstado((a) => ({ ...a, data_fim: e.target.value || null }))}
                  className={entradaClasse}
                />
              </Campo>
            </div>

            {faltaDia && (
              <p className="rounded-campo bg-superficie-2 px-4 py-3 text-sm">
                Escolha ao menos um dia da semana.
              </p>
            )}

            {resumo && (
              <p aria-live="polite" className="rounded-campo bg-superficie-2 px-4 py-3 text-sm">
                {resumo.texto}, de {ddmmaaaa(resumo.de)} a {ddmmaaaa(resumo.ate)}:{' '}
                <strong>
                  {resumo.aulas} {resumo.aulas === 1 ? 'aula' : 'aulas'}
                </strong>
                {resumo.pulam > 0 &&
                  ` (${resumo.pulam} ${resumo.pulam === 1 ? 'data pulada' : 'datas puladas'} por feriado ou recesso)`}
                .
              </p>
            )}
          </>
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

        {/* O professor recebe este link no e-mail de turma nova. */}
        <Campo
          etiqueta="Link da videochamada"
          ajuda="Em turma online, deixe em branco: ao salvar, o sistema cria a sala do Google Meet com o professor como coorganizador. Só cole um link aqui para usar outra sala."
        >
          <input
            type="url"
            inputMode="url"
            placeholder="https://meet.google.com/…"
            value={estado.link_videochamada ?? ''}
            onChange={(e) =>
              setEstado((a) => ({ ...a, link_videochamada: e.target.value || null }))
            }
            className={entradaClasse}
          />
        </Campo>
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
