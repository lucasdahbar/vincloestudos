'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  errosDaEdicao,
  planoDeSaida,
  varrer,
  type Acao,
  type AulaDaVarredura,
  type AulaVarrida,
  type Desfecho,
  type Escopo,
  type Respostas,
} from '@/dominio/agenda/varredura'
import { Botao, BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entradaClasse } from '@/ui/Campo'
import { pilulaDaSituacao } from '@/ui/situacao-da-aula'
import { editarEstaAula, tirarDaAgenda } from './acoes'

/** O que a edicao de "so esta aula" precisa saber da aula (etapa 6b). */
export interface DadosDaEdicao {
  aulaId: number
  /** AAAA-MM-DDTHH:MM */
  inicio: string
  fim: string
  professorId: number
  professores: { id: number; nome: string }[]
}

/** Etapa 6c: o que a previa pode aplicar ao tirar aulas da agenda. */
export type PedidoDeSaida = { tipo: 'excluir'; aulaId: number } | { tipo: 'encerrar'; data: string }

const ROTULO_DESFECHO: Record<Desfecho, string> = {
  reposicao: 'Reposição',
  'sem-reposicao': 'Sem reposição (sai da próxima cobrança)',
  credito: 'Crédito do valor cobrado',
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function quando(inicio: string): string {
  const [data, hora] = inicio.split('T')
  const semana = DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()]
  return `${semana}, ${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)} às ${hora}`
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Etapa 6a: a varredura roda aqui, no navegador, sobre os fatos lidos no
 * servidor. Cada resposta da gestora refaz a previa na hora.
 */
export function PreviaDaMudanca({
  aulas,
  acao,
  escopo,
  edicao,
  turmaId,
  saida,
  semAplicar,
}: {
  aulas: AulaDaVarredura[]
  acao: Acao
  escopo: Escopo
  /** So esta aula, dia/horario ou professor: a previa ganha o "aplicar" (6b). */
  edicao?: DadosDaEdicao
  turmaId: number
  /** Excluir esta aula ou encerrar: a previa ganha o "aplicar" (6c). */
  saida?: PedidoDeSaida
  /** Por que esta combinacao ainda nao aplica. */
  semAplicar?: string
}) {
  const [respostas, setRespostas] = useState<Respostas>({})
  const v = useMemo(() => varrer(aulas, acao, escopo, respostas), [aulas, acao, escopo, respostas])

  const responderAula = (id: number, aconteceu: boolean) =>
    setRespostas((r) => ({ ...r, aconteceu: { ...r.aconteceu, [id]: aconteceu } }))
  const escolher = (aula: number, aluno: number, d: Desfecho) =>
    setRespostas((r) => ({ ...r, alunos: { ...r.alunos, [`${aula}:${aluno}`]: d } }))
  const todosParaReposicao = () =>
    setRespostas((r) => {
      const alunos = { ...r.alunos }
      for (const a of v.aulas) for (const x of a.alunos) alunos[`${a.id}:${x.aluno_id}`] = 'reposicao'
      return { ...r, alunos }
    })

  // Encerrar sem aula pela frente ainda termina a turma: o "aplicar" aparece.
  if (v.aulas.length === 0 && !(saida?.tipo === 'encerrar')) {
    return <Cartao>Nenhuma aula neste período.</Cartao>
  }

  const grupo = (g: AulaVarrida['grupo']) => v.aulas.filter((a) => a.grupo === g)
  const comAlunos = v.aulas.some((a) => a.alunos.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">
        {plural(v.mudam, 'aula muda', 'aulas mudam')}, {plural(v.escolhas, 'precisa', 'precisam')} de
        escolha, {plural(v.ficam, 'fica como está', 'ficam como estão')}.
      </p>

      {v.avisar.length > 0 && (
        <Cartao>
          <h2 className="font-medium">Avisar</h2>
          <p className="text-sm text-tinta-suave">Alunos de outras turmas que vêm repor nestas aulas:</p>
          <ul className="mt-2 text-sm">
            {v.avisar.map((x) => (
              <li key={`${x.nome}:${x.data}`}>
                {x.nome} — {x.data.split('-').reverse().join('/')}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {grupo('escolha').length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl">Precisam de escolha</h2>
            {comAlunos && (
              <Botao type="button" aparencia="secundario" onClick={todosParaReposicao}>
                Todos os alunos para reposição
              </Botao>
            )}
          </div>
          {grupo('escolha').map((a) => (
            <LinhaDaAula key={a.id} aula={a}>
              {a.pergunta === 'aconteceu' && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  Passou sem chamada. A aula aconteceu?
                  <Botao type="button" aparencia="secundario" onClick={() => responderAula(a.id, true)}>
                    Sim
                  </Botao>
                  <Botao type="button" aparencia="secundario" onClick={() => responderAula(a.id, false)}>
                    Não
                  </Botao>
                </div>
              )}
              <Alunos aula={a} escolher={escolher} />
            </LinhaDaAula>
          ))}
        </section>
      )}

      {grupo('muda').length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl">Mudam</h2>
          {grupo('muda').map((a) => (
            <LinhaDaAula key={a.id} aula={a}>
              {a.destino && (
                <p className="text-sm text-tinta-suave">
                  {a.destino === 'apagada'
                    ? 'Sai da agenda.'
                    : 'Sai da agenda e fica guardada como Excluída (segura a cobrança e as reposições).'}
                </p>
              )}
              <Alunos aula={a} escolher={escolher} />
            </LinhaDaAula>
          ))}
        </section>
      )}

      {grupo('fica').length > 0 && (
        <details className="rounded-cartao border border-borda bg-superficie p-4">
          <summary className="cursor-pointer text-xl">
            Ficam como estão ({grupo('fica').length})
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            {grupo('fica').map((a) => (
              <LinhaDaAula key={a.id} aula={a}>
                <p className="text-sm text-tinta-suave">{a.motivo}</p>
              </LinhaDaAula>
            ))}
          </div>
        </details>
      )}

      {edicao && acao.tipo === 'editar' ? (
        <EditarEstaAula
          aula={v.aulas[0]}
          dados={edicao}
          mudaQuando={acao.quando === true}
          mudaProfessor={acao.professor === true}
          aconteceu={respostas.aconteceu?.[edicao.aulaId]}
        />
      ) : saida ? (
        <AplicarSaida turmaId={turmaId} pedido={saida} aulas={aulas} varredura={v} respostas={respostas} />
      ) : (
        <p className="text-sm text-tinta-suave">
          {semAplicar ?? 'Esta é só a prévia: aplicar esta mudança chega nas próximas atualizações.'}
        </p>
      )}
    </div>
  )
}

/**
 * Etapa 6b: aplicar a edicao de uma aula. O botao so libera quando a previa
 * diz que a aula muda; o servidor confere tudo de novo antes de gravar.
 */
function EditarEstaAula({
  aula,
  dados,
  mudaQuando,
  mudaProfessor,
  aconteceu,
}: {
  aula: AulaVarrida | undefined
  dados: DadosDaEdicao
  mudaQuando: boolean
  mudaProfessor: boolean
  aconteceu: boolean | undefined
}) {
  const router = useRouter()
  const [data, setData] = useState(dados.inicio.slice(0, 10))
  const [horaInicio, setHoraInicio] = useState(dados.inicio.slice(11, 16))
  const [horaFim, setHoraFim] = useState(dados.fim.slice(11, 16))
  const [professorId, setProfessorId] = useState(dados.professorId)
  const [alerta, setAlerta] = useState<string | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [feito, setFeito] = useState<{ nome: string; data: string }[] | null>(null)
  const [pendente, iniciar] = useTransition()

  const mudouHorario =
    mudaQuando && (data !== dados.inicio.slice(0, 10) || horaInicio !== dados.inicio.slice(11, 16) || horaFim !== dados.fim.slice(11, 16))
  const mudouProfessor = mudaProfessor && professorId !== dados.professorId
  const bloqueio = errosDaEdicao(aula, { quando: mudouHorario, professor: mudouProfessor })
  const nadaMudou = !mudouHorario && !mudouProfessor

  // Mexer no horario depois do aviso de feriado pede outra conferencia.
  const mudou = (f: () => void) => {
    f()
    setAlerta(null)
  }

  function aplicar() {
    setErros([])
    iniciar(async () => {
      try {
        const r = await editarEstaAula(dados.aulaId, {
          nova: mudouHorario ? { data, inicio: horaInicio, fim: horaFim } : null,
          professorId: mudouProfessor ? professorId : null,
          aconteceu,
          confirmouAlerta: alerta !== null,
        })
        if (r.ok) {
          setFeito(r.avisar)
          router.refresh()
        } else if (r.alerta) setAlerta(r.alerta)
        else setErros(r.erros ?? ['Não foi possível mudar a aula.'])
      } catch {
        setErros(['Não foi possível mudar a aula agora. Tente de novo.'])
      }
    })
  }

  if (feito) {
    return (
      <Cartao>
        <p className="font-medium">Aula alterada.</p>
        <p className="mt-1 text-sm text-tinta-suave">A agenda do professor no Google acompanha em instantes.</p>
        {feito.length > 0 && (
          <p className="mt-2 text-sm">
            Avise quem vem repor: {feito.map((x) => x.nome).join(', ')}.
          </p>
        )}
        <div className="mt-4">
          <BotaoLink href={`/agenda/aulas/${dados.aulaId}`} aparencia="secundario">
            Ver a aula
          </BotaoLink>
        </div>
      </Cartao>
    )
  }

  return (
    <Cartao>
      <h2 className="text-xl">Aplicar nesta aula</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {mudaQuando && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Dia</span>
              <input type="date" value={data} onChange={(e) => mudou(() => setData(e.target.value))} className={entradaClasse} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Início</span>
              <input type="time" value={horaInicio} onChange={(e) => mudou(() => setHoraInicio(e.target.value))} className={entradaClasse} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Término</span>
              <input type="time" value={horaFim} onChange={(e) => mudou(() => setHoraFim(e.target.value))} className={entradaClasse} />
            </label>
          </>
        )}
        {mudaProfessor && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Professor desta aula</span>
            <select value={professorId} onChange={(e) => setProfessorId(Number(e.target.value))} className={entradaClasse}>
              {dados.professores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {!nadaMudou && bloqueio.length > 0 && (
        <p className="mt-3 text-sm text-tinta-suave">{bloqueio[0]}</p>
      )}
      {alerta && (
        <div role="alert" className="mt-3 rounded-campo bg-alerta-suave px-4 py-3 text-sm">
          {alerta} Mudar mesmo assim?
        </div>
      )}
      {erros.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Botao type="button" disabled={pendente || nadaMudou || bloqueio.length > 0} onClick={aplicar}>
          {pendente ? 'Aplicando…' : alerta ? 'Sim, mudar' : 'Aplicar'}
        </Botao>
      </div>
    </Cartao>
  )
}

/**
 * Etapa 6c: excluir esta aula ou encerrar a turma. O botao so libera com a
 * previa toda respondida; o servidor refaz a varredura antes de gravar.
 */
function AplicarSaida({
  turmaId,
  pedido,
  aulas,
  varredura,
  respostas,
}: {
  turmaId: number
  pedido: PedidoDeSaida
  aulas: AulaDaVarredura[]
  varredura: ReturnType<typeof varrer>
  respostas: Respostas
}) {
  const router = useRouter()
  const [erros, setErros] = useState<string[]>([])
  const [feito, setFeito] = useState<{ nome: string; data: string }[] | null>(null)
  const [pendente, iniciar] = useTransition()
  const bloqueio = planoDeSaida(aulas, varredura).erros

  const encerrar = pedido.tipo === 'encerrar'
  const rotulo = encerrar
    ? `Encerrar a partir de ${pedido.data.split('-').reverse().join('/')}`
    : 'Excluir esta aula'

  function aplicar() {
    setErros([])
    iniciar(async () => {
      try {
        const r = await tirarDaAgenda(turmaId, pedido, respostas)
        if (r.ok) {
          setFeito(r.avisar)
          router.refresh()
        } else {
          setErros(r.erros)
          if (r.parcial) router.refresh()
        }
      } catch {
        setErros(['Não foi possível aplicar agora. Tente de novo.'])
      }
    })
  }

  if (feito) {
    return (
      <Cartao>
        <p className="font-medium">{encerrar ? 'Turma encerrada.' : 'Aula excluída.'}</p>
        <p className="mt-1 text-sm text-tinta-suave">
          Quem foi para reposição aparece em Reposições; os créditos, em Créditos. A agenda do
          professor no Google acompanha em instantes.
        </p>
        {feito.length > 0 && (
          <p className="mt-2 text-sm">
            Avise quem vinha repor (voltou para as reposições pendentes):{' '}
            {feito.map((x) => x.nome).join(', ')}.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <BotaoLink href={`/turmas/${turmaId}`} aparencia="secundario">
            Ver a turma
          </BotaoLink>
          <BotaoLink href="/reposicoes" aparencia="secundario">
            Reposições
          </BotaoLink>
        </div>
      </Cartao>
    )
  }

  return (
    <Cartao>
      <h2 className="text-xl">{encerrar ? 'Encerrar a turma' : 'Excluir esta aula'}</h2>
      {bloqueio.length > 0 ? (
        <p className="mt-2 text-sm text-tinta-suave">{bloqueio[0]}</p>
      ) : (
        <p className="mt-2 text-sm text-tinta-suave">
          {encerrar
            ? 'As aulas acima saem da agenda e as matrículas terminam na véspera.'
            : 'A aula sai da agenda com o que foi escolhido para cada aluno.'}
        </p>
      )}
      {erros.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <Botao type="button" disabled={pendente || bloqueio.length > 0} onClick={aplicar}>
          {pendente ? 'Aplicando…' : rotulo}
        </Botao>
      </div>
    </Cartao>
  )
}

function LinhaDaAula({ aula, children }: { aula: AulaVarrida; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-campo border border-borda bg-superficie px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{quando(aula.inicio)}</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${pilulaDaSituacao(aula.situacao)}`}>
          {aula.situacao}
        </span>
      </div>
      {children}
      {aula.avisos.map((x) => (
        <p key={x} className="rounded-campo bg-alerta-suave px-3 py-1.5 text-sm text-alerta">
          {x}
        </p>
      ))}
    </div>
  )
}

function Alunos({
  aula,
  escolher,
}: {
  aula: AulaVarrida
  escolher: (aula: number, aluno: number, d: Desfecho) => void
}) {
  if (aula.alunos.length === 0) return null
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {aula.alunos.map((x) => (
        <li key={x.aluno_id} className="flex flex-wrap items-center gap-3">
          <span className="min-w-32">{x.nome}</span>
          {x.opcoes.map((d) => (
            <label key={d} className="flex items-center gap-1">
              <input
                type="radio"
                name={`${aula.id}:${x.aluno_id}`}
                checked={x.escolhido === d}
                onChange={() => escolher(aula.id, x.aluno_id, d)}
              />
              {ROTULO_DESFECHO[d]}
            </label>
          ))}
        </li>
      ))}
    </ul>
  )
}
