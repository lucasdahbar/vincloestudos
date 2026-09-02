import { describe, expect, it } from 'vitest'
import { montarEvento, primeiraOcorrencia, type TurmaDoEvento } from './evento-google'

const turma = (over: Partial<TurmaDoEvento> = {}): TurmaDoEvento => ({
  nome: 'Matemática · 9º ano · Colégio São José',
  tipo_recorrencia: 'Recorrente',
  data_unica: null,
  dias_semana: [2, 4], // terça e quinta
  horario_inicio: '15:00',
  horario_fim: '16:00',
  modalidade: 'Online',
  inicio_recorrencia: '2026-09-02', // uma quarta-feira
  professor_email: 'rafael@exemplo.com',
  ...over,
})

describe('montarEvento (G2)', () => {
  it('usa o nome da turma como título', () => {
    expect(montarEvento(turma()).summary).toBe('Matemática · 9º ano · Colégio São José')
  })

  it('marca o horário no fuso de Brasília, não em UTC', () => {
    // Sem o timeZone, o Google interpretaria como UTC e a aula das 15h
    // apareceria às 12h na agenda do professor.
    const e = montarEvento(turma())
    expect(e.start.timeZone).toBe('America/Sao_Paulo')
    expect(e.start.dateTime).toMatch(/T15:00:00$/)
    expect(e.end.dateTime).toMatch(/T16:00:00$/)
  })

  it('gera a regra semanal com os dias certos', () => {
    expect(montarEvento(turma()).recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'])
  })

  it('ordena os dias, para a regra não mudar à toa', () => {
    const e = montarEvento(turma({ dias_semana: [4, 2] }))
    expect(e.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH'])
  })

  it('cobre domingo e sábado nas pontas', () => {
    const e = montarEvento(turma({ dias_semana: [0, 6] }))
    expect(e.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=SU,SA'])
  })

  it('não põe data de término na recorrência', () => {
    // A turma não tem fim previsto; quem encerra é o sistema. Um UNTIL chutado
    // faria as aulas sumirem da agenda sem ninguém pedir.
    expect(montarEvento(turma()).recurrence?.[0]).not.toContain('UNTIL')
  })

  it('ancora a recorrência no primeiro dia que é da turma', () => {
    // 02/09/2026 é quarta; a turma é terça e quinta. Se o start ficasse na
    // quarta, o Google criaria uma ocorrência num dia que a turma não tem.
    const e = montarEvento(turma())
    expect(e.start.dateTime.slice(0, 10)).toBe('2026-09-03') // quinta
  })

  it('mantém a data quando ela já é um dia da turma', () => {
    const e = montarEvento(turma({ inicio_recorrencia: '2026-09-01' })) // terça
    expect(e.start.dateTime.slice(0, 10)).toBe('2026-09-01')
  })

  it('convida o professor, para a aula cair na agenda pessoal dele', () => {
    expect(montarEvento(turma()).attendees).toEqual([{ email: 'rafael@exemplo.com' }])
  })

  it('sem e-mail do professor, não inventa convidado', () => {
    expect(montarEvento(turma({ professor_email: null })).attendees).toBeUndefined()
  })

  it('a descrição diz quando a turma acontece', () => {
    const { description } = montarEvento(turma())
    expect(description).toContain('Ter, Qui, toda semana')
    expect(description).toContain('das 15:00 às 16:00')
    expect(description).toContain('Modalidade: Online')
  })

  it('avisa que o sistema pode sobrescrever edições feitas na agenda', () => {
    expect(montarEvento(turma()).description).toContain('sobrescritas')
  })

  describe('turma que não se repete', () => {
    const unica = turma({
      tipo_recorrencia: 'Único',
      data_unica: '2026-09-15',
      dias_semana: [],
    })

    it('não gera regra de recorrência', () => {
      expect(montarEvento(unica).recurrence).toBeUndefined()
    })

    it('usa a data marcada', () => {
      expect(montarEvento(unica).start.dateTime).toBe('2026-09-15T15:00:00')
    })

    it('a descrição diz que é aula única', () => {
      expect(montarEvento(unica).description).toContain('Aula única')
    })

    it('sem data marcada, recusa em vez de criar evento errado', () => {
      expect(() => montarEvento({ ...unica, data_unica: null })).toThrow(/sem data/i)
    })
  })

  it('turma recorrente sem dia da semana também recusa', () => {
    expect(() => montarEvento(turma({ dias_semana: [] }))).toThrow(/sem data/i)
  })
})

describe('primeiraOcorrencia', () => {
  it('devolve o próprio dia quando ele já serve', () => {
    // 02/09/2026 é quarta.
    expect(primeiraOcorrencia(turma({ dias_semana: [3], inicio_recorrencia: '2026-09-02' }))).toBe(
      '2026-09-02',
    )
  })

  it('avança até o próximo dia da turma', () => {
    expect(primeiraOcorrencia(turma({ dias_semana: [5], inicio_recorrencia: '2026-09-02' }))).toBe(
      '2026-09-04',
    )
  })

  it('vira a semana quando o dia já passou', () => {
    // Quarta procurando segunda: a próxima é a da semana seguinte.
    expect(primeiraOcorrencia(turma({ dias_semana: [1], inicio_recorrencia: '2026-09-02' }))).toBe(
      '2026-09-07',
    )
  })

  it('atravessa a virada do mês', () => {
    expect(primeiraOcorrencia(turma({ dias_semana: [4], inicio_recorrencia: '2026-09-29' }))).toBe(
      '2026-10-01',
    )
  })

  it('sem dia da semana não há ocorrência', () => {
    expect(primeiraOcorrencia(turma({ dias_semana: [] }))).toBeNull()
  })
})
