import { describe, expect, it } from 'vitest'
import { situacaoDaAula, type FatosDaAula } from './situacao'

const AGORA = '2026-10-29T14:00'
const futura: FatosDaAula = {
  status: 'Agendada',
  fim: '2026-11-02T19:00',
  agora: AGORA,
  alunos: 0,
  chamadaFeita: false,
  cobrancas: [],
  pagamentos: [],
}
const passada: FatosDaAula = { ...futura, fim: '2026-10-26T19:00', alunos: 2 }

describe('situacaoDaAula', () => {
  it('sem aluno é Criada; com aluno é Confirmada', () => {
    expect(situacaoDaAula(futura).principal).toBe('Criada')
    expect(situacaoDaAula({ ...futura, alunos: 1 }).principal).toBe('Confirmada')
  })

  it('a data passou e não teve chamada: Aguardando chamada', () => {
    expect(situacaoDaAula(passada).principal).toBe('Aguardando chamada')
  })

  it('aula de hoje que ainda não terminou não está aguardando chamada', () => {
    expect(situacaoDaAula({ ...passada, fim: '2026-10-29T15:00' }).principal).toBe('Confirmada')
  })

  it('passada e sem aluno não tem chamada a fazer: continua Criada', () => {
    expect(situacaoDaAula({ ...passada, alunos: 0 }).principal).toBe('Criada')
  })

  it('chamada feita é Realizada, mesmo que o status ainda diga Agendada', () => {
    expect(situacaoDaAula({ ...passada, chamadaFeita: true }).principal).toBe('Realizada')
    expect(situacaoDaAula({ ...passada, status: 'Realizada' }).principal).toBe('Realizada')
  })

  it('excluída, cancelada e feriado ficam como estão', () => {
    for (const status of ['Excluída', 'Cancelada', 'Feriado'] as const) {
      expect(situacaoDaAula({ ...passada, status, chamadaFeita: true }).principal).toBe(status)
    }
  })

  it('cobrança: rascunho não conta; vale o aluno mais avançado (decisão 1)', () => {
    expect(situacaoDaAula({ ...futura, cobrancas: ['Rascunho'] }).cobranca).toBeNull()
    expect(situacaoDaAula({ ...futura, cobrancas: ['Rascunho', 'Confirmada'] }).cobranca).toBe('Em cobrança')
    expect(situacaoDaAula({ ...futura, cobrancas: ['Enviada', 'Parcial'] }).cobranca).toBe('Recebida')
    expect(situacaoDaAula({ ...futura, cobrancas: ['Cancelada'] }).cobranca).toBeNull()
  })

  it('pagamento: conta pendente é Em pagamento; paga é Paga', () => {
    expect(situacaoDaAula({ ...passada, pagamentos: [null, 'Pendente'] }).pagamento).toBe('Em pagamento')
    expect(situacaoDaAula({ ...passada, pagamentos: ['Pendente', 'Pago'] }).pagamento).toBe('Paga')
    expect(situacaoDaAula({ ...passada, pagamentos: [null] }).pagamento).toBeNull()
  })

  it('pagamento: conta paga em parte continua Em pagamento (revisão de 30/10)', () => {
    expect(situacaoDaAula({ ...passada, pagamentos: ['Parcial'] }).pagamento).toBe('Em pagamento')
  })

  it('Concluída: realizada, tudo recebido por inteiro e todo professor pago', () => {
    const feita = { ...passada, chamadaFeita: true }
    expect(situacaoDaAula({ ...feita, cobrancas: ['Quitada', 'Quitada'], pagamentos: ['Pago', 'Pago'] }).principal).toBe('Concluída')
    // Um aluno ainda deve uma parte: falta coisa em aberto.
    expect(situacaoDaAula({ ...feita, cobrancas: ['Quitada', 'Parcial'], pagamentos: ['Pago', 'Pago'] }).principal).toBe('Realizada')
    // Uma presença ainda não entrou num pagamento.
    expect(situacaoDaAula({ ...feita, cobrancas: ['Quitada'], pagamentos: ['Pago', null] }).principal).toBe('Realizada')
    // Sem nada cobrado não há o que concluir.
    expect(situacaoDaAula({ ...feita, cobrancas: [], pagamentos: ['Pago'] }).principal).toBe('Realizada')
  })
})
