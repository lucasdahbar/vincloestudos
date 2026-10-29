'use client'

import { useMemo, useState } from 'react'
import {
  varrer,
  type Acao,
  type AulaDaVarredura,
  type AulaVarrida,
  type Desfecho,
  type Escopo,
  type Respostas,
} from '@/dominio/agenda/varredura'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { pilulaDaSituacao } from '@/ui/situacao-da-aula'

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
}: {
  aulas: AulaDaVarredura[]
  acao: Acao
  escopo: Escopo
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

  if (v.aulas.length === 0) {
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

      <p className="text-sm text-tinta-suave">
        Esta é só a prévia: aplicar a mudança chega nas próximas atualizações.
      </p>
    </div>
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
