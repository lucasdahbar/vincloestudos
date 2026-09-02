import { formatarBRL, somar, type Centavos } from '@/dominio/dinheiro'

/**
 * P6 (Rodada 2): texto do relatorio de fechamento.
 *
 * O agrupamento e por data + horario + turma, e nao so por data. Um professor
 * que da duas aulas no mesmo dia precisa ver dois blocos: agrupado so por data,
 * as duas turmas viram uma lista unica de alunos e ele nao consegue conferir se
 * o fechamento bate com o que ele deu.
 *
 * Mesmo padrao dos outros textos do sistema (cobranca, notificacoes): sai
 * pronto para o WhatsApp, sem formatacao que o aplicativo nao entenda.
 */
export interface LinhaRelatorio {
  data_aula: string
  /** HH:MM. Vazio quando a aula nao tem horario registrado. */
  horario_inicio: string
  turma_nome: string
  aluno_nome: string
  valor_servico: Centavos
  percentual_aplicado: number
  valor_professor: Centavos
}

export interface DadosRelatorio {
  professor_nome: string
  /** Data em ISO. O fechamento passou a ser so "até" (P2). */
  ate: string
  linhas: LinhaRelatorio[]
}

export function gerarRelatorioFechamento(dados: DadosRelatorio): string {
  const texto: string[] = [
    `Fechamento — ${dados.professor_nome}`,
    `Período: até ${dataCompleta(dados.ate)}`,
    '',
  ]

  const grupos = new Map<string, LinhaRelatorio[]>()
  for (const linha of ordenar(dados.linhas)) {
    // A turma entra na chave: duas turmas no mesmo horario sao dois blocos.
    const chave = `${linha.data_aula}|${linha.horario_inicio}|${linha.turma_nome}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), linha])
  }

  for (const [chave, doGrupo] of grupos) {
    const [data, horario, turma] = chave.split('|')
    texto.push(`${dataCurta(data)}${horario ? `, ${horario.replace(':', 'h')}` : ''} — ${turma}`)

    for (const l of doGrupo) {
      texto.push(
        `${l.aluno_nome} — ${formatarBRL(l.valor_servico)} × ${percentual(l.percentual_aplicado)} = ${formatarBRL(l.valor_professor)}`,
      )
    }

    texto.push('')
  }

  const total = somar(...dados.linhas.map((l) => l.valor_professor))
  texto.push(`TOTAL: ${formatarBRL(total)} (${dados.linhas.length} ${presencas(dados.linhas.length)})`)

  return texto.join('\n')
}

function ordenar(linhas: LinhaRelatorio[]): LinhaRelatorio[] {
  return linhas
    .slice()
    .sort(
      (a, b) =>
        a.data_aula.localeCompare(b.data_aula) ||
        a.horario_inicio.localeCompare(b.horario_inicio) ||
        a.turma_nome.localeCompare(b.turma_nome, 'pt-BR') ||
        a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR'),
    )
}

/** 60 vira "60%"; 62.5 vira "62,5%" — sem casas decimais que nao existem. */
function percentual(valor: number): string {
  // So mexe no que vem depois da virgula: `replace(/\.?0+$/)` cortaria o zero
  // de "60" e escreveria 6%.
  return `${String(valor).replace('.', ',')}%`
}

function presencas(n: number): string {
  return n === 1 ? 'presença' : 'presenças'
}

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

function dataCompleta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
