import { describe, expect, it } from 'vitest'
import { deReal } from '@/dominio/dinheiro'
import { gerarRelatorioFechamento, type LinhaRelatorio } from './relatorio'

const MAT_9 = 'Matemática · 9º ano · Colégio São José'
const FISICA = 'Física · 1ª série · Médio'

const linha = (over: Partial<LinhaRelatorio> = {}): LinhaRelatorio => ({
  data_aula: '2026-08-27',
  horario_inicio: '15:00',
  turma_nome: MAT_9,
  aluno_nome: 'João Ribeiro',
  valor_servico: deReal(105),
  percentual_aplicado: 60,
  valor_professor: deReal(63),
  ...over,
})

describe('gerarRelatorioFechamento (P6)', () => {
  // O exemplo abaixo é o do próprio documento, copiado à risca: é o formato
  // que a gestora aprovou, e qualquer desvio dele é regressão.
  it('reproduz o exemplo do documento', () => {
    const texto = gerarRelatorioFechamento({
      professor_nome: 'Rafael de Oliveira Marcelino',
      ate: '2026-08-31',
      linhas: [
        linha(),
        linha({ aluno_nome: 'Pedro Tavares' }),
        linha({
          horario_inicio: '17:00',
          turma_nome: FISICA,
          aluno_nome: 'Laura Prado',
          valor_servico: deReal(130),
          valor_professor: deReal(78),
        }),
        linha({ data_aula: '2026-08-29' }),
      ],
    })

    expect(texto).toBe(
      [
        'Fechamento — Rafael de Oliveira Marcelino',
        'Período: até 31/08/2026',
        '',
        `27/08, 15h00 — ${MAT_9}`,
        'João Ribeiro — R$ 105,00 × 60% = R$ 63,00',
        'Pedro Tavares — R$ 105,00 × 60% = R$ 63,00',
        '',
        `27/08, 17h00 — ${FISICA}`,
        'Laura Prado — R$ 130,00 × 60% = R$ 78,00',
        '',
        `29/08, 15h00 — ${MAT_9}`,
        'João Ribeiro — R$ 105,00 × 60% = R$ 63,00',
        '',
        'TOTAL: R$ 267,00 (4 presenças)',
      ].join('\n'),
    )
  })

  it('duas turmas no mesmo dia e horário viram blocos separados', () => {
    // O motivo do item P6: agrupado só por data, as duas listas se fundiriam.
    const texto = gerarRelatorioFechamento({
      professor_nome: 'Rafael',
      ate: '2026-08-31',
      linhas: [
        linha({ turma_nome: 'Turma A', aluno_nome: 'Ana' }),
        linha({ turma_nome: 'Turma B', aluno_nome: 'Bruno' }),
      ],
    })
    expect(texto).toContain('27/08, 15h00 — Turma A')
    expect(texto).toContain('27/08, 15h00 — Turma B')
  })

  it('ordena por data, depois horário, depois turma', () => {
    const texto = gerarRelatorioFechamento({
      professor_nome: 'Rafael',
      ate: '2026-08-31',
      linhas: [
        linha({ data_aula: '2026-08-29', turma_nome: 'Z' }),
        linha({ data_aula: '2026-08-27', horario_inicio: '17:00', turma_nome: 'B' }),
        linha({ data_aula: '2026-08-27', horario_inicio: '09:00', turma_nome: 'A' }),
      ],
    })
    const blocos = texto.split('\n').filter((l) => l.includes(' — ') && l.includes('/08'))
    expect(blocos.map((b) => b.split(' — ')[1])).toEqual(['A', 'B', 'Z'])
  })

  it('conta uma presença no singular', () => {
    const texto = gerarRelatorioFechamento({
      professor_nome: 'Rafael',
      ate: '2026-08-31',
      linhas: [linha()],
    })
    expect(texto).toContain('TOTAL: R$ 63,00 (1 presença)')
  })

  it('percentual quebrado não ganha zeros à toa', () => {
    const texto = gerarRelatorioFechamento({
      professor_nome: 'Rafael',
      ate: '2026-08-31',
      linhas: [linha({ percentual_aplicado: 62.5 })],
    })
    expect(texto).toContain('× 62,5% =')
  })

  it('fechamento sem presença nenhuma ainda produz um relatório legível', () => {
    const texto = gerarRelatorioFechamento({
      professor_nome: 'Rafael',
      ate: '2026-08-31',
      linhas: [],
    })
    expect(texto).toContain('TOTAL: R$ 0,00 (0 presenças)')
  })
})
