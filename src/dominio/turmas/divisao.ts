import { paraUTC, somarDias } from '@/dominio/agenda/recorrencia'
import type { Escopo, Varredura } from '@/dominio/agenda/varredura'
import type { StatusAula } from '@/dominio/tipos'

/**
 * Etapa 6d de "turmas como agenda" (29/10/2026): mudar a serie a partir de
 * uma data — dia e horario, professor ou servico.
 *
 * Como o Google faz: a turma de hoje termina na vespera do corte e nasce uma
 * continuacao com a regra nova (decidido pelo Lucas em 29/10/2026). As aulas
 * do corte em diante vao para ela com tudo o que aponta para elas — alunos,
 * avisos, reposicoes, cobrancas —, porque cada aula e movida, nunca apagada e
 * recriada. Sem aula antes do corte nao ha o que dividir: muda a propria turma.
 *
 * Aqui so o plano; quem grava e `dividir_turma`, no banco, de uma vez.
 */

export interface MudancaDaSerie {
  quando?: { dias_semana: number[]; horario_inicio: string; horario_fim: string }
  professor_id?: number
  servico_id?: number
}

export interface TurmaDaDivisao {
  tipo_recorrencia: 'Recorrente' | 'Único'
  status: 'Ativa' | 'Encerrada'
  data_inicio: string | null
  data_fim: string | null
  dias_semana: number[]
  /** HH:MM. */
  horario_inicio: string
  horario_fim: string
  professor_id: number
  servico_id: number
}

export interface AulaDaDivisao {
  id: number
  /** Data de referencia: a original, se a aula foi remarcada. */
  data: string
  /** AAAA-MM-DDTHH:MM no relogio da escola. */
  inicio: string
  fim: string
  /** Remarcada: o dia e horario de onde ela saiu. */
  original: string | null
  status: StatusAula
  professor_id: number
  servico_id: number
}

/** Como a aula fica depois da mudanca. */
export interface AulaDividida {
  id: number
  inicio: string
  fim: string
  original: string | null
  professor_id: number
  servico_id: number
}

export interface PlanoDeDivisao {
  /** Nao vazio: nada pode ser gravado. */
  erros: string[]
  /** O que a gestora precisa saber, mesmo podendo aplicar. */
  avisos: string[]
  /** Primeiro dia da regra nova. */
  corte: string
  /** Ha aula antes do corte: a turma de hoje termina e nasce a continuacao. */
  novaTurma: boolean
  /** Toda aula do corte em diante, com os valores finais. */
  aulas: AulaDividida[]
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const diaDaSemana = (iso: string) => paraUTC(iso).getUTCDay()

/** As datas de `dias` na semana de 7 dias que comeca em `inicio`. */
function datasDaSemana(inicio: string, dias: number[]): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(inicio, i)).filter((d) => dias.includes(diaDaSemana(d)))
}

/**
 * Para onde vai a aula de `data` quando os dias da semana mudam. As semanas
 * contam a partir do corte, e dentro de cada uma a k-esima aula antiga vira a
 * k-esima nova: a partir de quarta, a segunda seguinte vira a quinta de
 * amanha. Nada cai antes do corte, e duas aulas nunca vao para o mesmo dia.
 */
export function novaDataNaRegra(data: string, corte: string, antigos: number[], novos: number[]): string {
  const semanas = Math.floor((paraUTC(data).getTime() - paraUTC(corte).getTime()) / (7 * 86_400_000))
  const inicio = somarDias(corte, semanas * 7)
  const i = datasDaSemana(inicio, antigos).indexOf(data)
  const destino = datasDaSemana(inicio, novos)[i]
  return i < 0 || !destino ? data : destino
}

const mesmos = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

function errosDaMudanca(t: TurmaDaDivisao, m: MudancaDaSerie): string[] {
  if (t.tipo_recorrencia !== 'Recorrente') return ['Turma de aula única: mude a aula pelo "Só esta aula".']
  if (t.status !== 'Ativa') return ['Esta turma está encerrada.']
  if (m.quando) {
    if (m.quando.dias_semana.length === 0) return ['Escolha pelo menos um dia da semana.']
    if (m.quando.dias_semana.length !== t.dias_semana.length) {
      return ['Para mudar quantas aulas há por semana, encerre esta turma e crie outra.']
    }
    if (m.quando.horario_fim <= m.quando.horario_inicio) return ['O horário de fim tem de ser depois do início.']
  }
  const igual =
    (!m.quando ||
      (mesmos(m.quando.dias_semana, t.dias_semana) &&
        m.quando.horario_inicio === t.horario_inicio &&
        m.quando.horario_fim === t.horario_fim)) &&
    (m.professor_id === undefined || m.professor_id === t.professor_id) &&
    (m.servico_id === undefined || m.servico_id === t.servico_id)
  return igual ? ['A regra nova é igual à de hoje.'] : []
}

export function planoDeDivisao(
  turma: TurmaDaDivisao,
  aulas: AulaDaDivisao[],
  v: Varredura,
  mudanca: MudancaDaSerie,
  opcoes: { escopo: Exclude<Escopo, 'esta'>; aPartirDe: string; puladas: ReadonlySet<string> },
): PlanoDeDivisao {
  const vazio = (erros: string[], corte = opcoes.aPartirDe): PlanoDeDivisao => ({
    erros,
    avisos: [],
    corte,
    novaTurma: false,
    aulas: [],
  })

  const basicos = errosDaMudanca(turma, mudanca)
  if (basicos.length > 0) return vazio(basicos)
  if (v.acao !== 'editar') return vazio(['Esta mudança não edita a série.'])
  if (v.escolhas > 0) {
    return vazio([`Falta responder em ${v.escolhas === 1 ? '1 aula' : `${v.escolhas} aulas`}: responda antes de aplicar.`])
  }

  const inicio = turma.data_inicio ?? opcoes.aPartirDe
  const fimDaTurma = turma.data_fim ?? '9999-12-31'
  // Decisao 14: a serie inteira inclui as aulas que ja aconteceram, que ficam
  // como estao. Na pratica, ela muda da primeira aula que pode mudar.
  const primeiraQueMuda = v.aulas.filter((a) => a.grupo === 'muda').map((a) => a.data).sort()[0]
  const pedida = opcoes.escopo === 'serie' ? (primeiraQueMuda ?? inicio) : opcoes.aPartirDe
  const corte = pedida > inicio ? pedida : inicio
  if (corte > fimDaTurma) return vazio([`A turma termina em ${ddmm(fimDaTurma)}: escolha uma data até lá.`], corte)

  // Dia e horario: a aula que fica depois do corte ficaria fora da regra nova.
  if (mudanca.quando) {
    const fica = v.aulas.find((a) => a.grupo === 'fica' && a.data >= corte)
    if (fica) {
      return vazio(
        [`A aula de ${ddmm(fica.data)} fica como está (${fica.motivo}). Mude a partir do dia seguinte a ela.`],
        corte,
      )
    }
  }

  const varrida = new Map(v.aulas.map((a) => [a.id, a]))
  const erros: string[] = []
  const avisos: string[] = []
  const novaRegra = (data: string) =>
    mudanca.quando ? novaDataNaRegra(data, corte, turma.dias_semana, mudanca.quando.dias_semana) : data
  const hora = mudanca.quando ?? { horario_inicio: turma.horario_inicio, horario_fim: turma.horario_fim }

  const resultado = aulas
    .filter((a) => a.data >= corte)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((a): AulaDividida => {
      const x = varrida.get(a.id)
      const campos = x?.grupo === 'muda' ? (x.campos ?? {}) : {}
      const final: AulaDividida = {
        id: a.id,
        inicio: a.inicio,
        fim: a.fim,
        original: a.original,
        // Quem esta com substituto fica com ele, como na troca da turma (6b).
        professor_id:
          campos.professor && mudanca.professor_id !== undefined && a.professor_id === turma.professor_id
            ? mudanca.professor_id
            : a.professor_id,
        servico_id:
          campos.servico && mudanca.servico_id !== undefined && a.servico_id === turma.servico_id
            ? mudanca.servico_id
            : a.servico_id,
      }

      // A excluida e a cancelada vao junto, para a semana delas continuar sem
      // aula (revisao de 30/10/2026: a cancelada ficava e a semana ganhava
      // aula). A de feriado fica: o dia novo daquela semana pode ter aula.
      const semAula = a.status === 'Excluída' || a.status === 'Cancelada'
      const move = mudanca.quando && (campos.quando || semAula)
      if (!move) return final

      const destino = novaRegra(a.data)
      const novoInicio = `${destino}T${hora.horario_inicio}`
      if (destino > fimDaTurma) {
        erros.push(`A aula de ${ddmm(a.data)} iria para ${ddmm(destino)}, depois do fim da turma (${ddmm(fimDaTurma)}).`)
      }
      if (a.original !== null) {
        // Remarcada: continua no dia escolhido; muda so o dia de onde saiu.
        return { ...final, original: novoInicio }
      }
      if (opcoes.puladas.has(destino) && !semAula) {
        // Feriado: a aula fica no dia de sempre, como remarcada dali.
        avisos.push(
          `${ddmm(destino)} é feriado ou recesso: a aula de ${ddmm(a.data)} continua em ${ddmm(a.data)} às ${a.inicio.slice(11, 16)}. Exclua-a se não houver aula.`,
        )
        return { ...final, original: novoInicio }
      }
      return { ...final, inicio: novoInicio, fim: `${destino}T${hora.horario_fim}`, original: null }
    })

  // Uma aula por turma por dia (26/10/2026), pela data de referencia.
  const vistos = new Set<string>()
  for (const a of resultado) {
    const dia = (a.original ?? a.inicio).slice(0, 10)
    if (vistos.has(dia)) erros.push(`Duas aulas cairiam em ${ddmm(dia)}.`)
    vistos.add(dia)
  }

  if (erros.length > 0) return vazio(erros, corte)
  return {
    erros: [],
    avisos,
    corte,
    novaTurma: aulas.some((a) => a.data < corte),
    aulas: resultado,
  }
}
