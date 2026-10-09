import { describe, expect, it } from 'vitest'
import {
  descricaoDoEvento,
  exdatesDoEvento,
  montarEvento,
  primeiraOcorrencia,
  regraDoEvento,
  type TurmaDoEvento,
} from './evento-google'
import type { RegraRecorrencia } from './recorrencia'

const turma = (over: Partial<TurmaDoEvento> = {}): TurmaDoEvento => ({
  nome: 'Matemática · 9º ano · Colégio São José',
  tipo_recorrencia: 'Recorrente',
  data_unica: null,
  frequencia: 'Semanal',
  intervalo: 1,
  dias_semana: [2, 4], // terça e quinta
  data_inicio: '2026-09-02', // uma quarta-feira
  data_fim: '2026-12-31',
  horario_inicio: '15:00',
  horario_fim: '16:00',
  modalidade: 'Online',
  professor_email: 'rafael@exemplo.com',
  alunos: [],
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

  it('gera a regra semanal com os dias certos e o fim', () => {
    expect(montarEvento(turma()).recurrence).toEqual([
      'RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TU,TH;UNTIL=20270101T025959Z',
    ])
  })

  it('ordena os dias, para a regra não mudar à toa', () => {
    expect(montarEvento(turma({ dias_semana: [4, 2] })).recurrence?.[0]).toContain('BYDAY=TU,TH')
  })

  it('cobre domingo e sábado nas pontas', () => {
    expect(montarEvento(turma({ dias_semana: [0, 6] })).recurrence?.[0]).toContain('BYDAY=SU,SA')
  })

  it('quinzenal leva o intervalo', () => {
    expect(montarEvento(turma({ intervalo: 2 })).recurrence?.[0]).toBe(
      'RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=TU,TH;UNTIL=20270101T025959Z',
    )
  })

  it('diária a cada 3 dias', () => {
    expect(
      montarEvento(turma({ frequencia: 'Diária', intervalo: 3, dias_semana: [] })).recurrence,
    ).toEqual(['RRULE:FREQ=DAILY;INTERVAL=3;UNTIL=20270101T025959Z'])
  })

  it('mensal no dia do início', () => {
    const e = montarEvento(
      turma({ frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-09-15' }),
    )
    expect(e.recurrence).toEqual(['RRULE:FREQ=MONTHLY;BYMONTHDAY=15;UNTIL=20270101T025959Z'])
    expect(e.start.dateTime).toBe('2026-09-15T15:00:00')
  })

  it('termina no fim do último dia no horário de Brasília', () => {
    // 31/12 23:59:59 em São Paulo (UTC-3) é 01/01 02:59:59 em UTC.
    expect(montarEvento(turma({ data_fim: '2026-11-30' })).recurrence?.[0]).toContain(
      'UNTIL=20261201T025959Z',
    )
  })

  it('as datas sem aula vão como EXDATE, no horário da aula', () => {
    const e = montarEvento(turma({ exdates: ['2026-10-15', '2026-09-08'] }))
    expect(e.recurrence?.[1]).toBe(
      'EXDATE;TZID=America/Sao_Paulo:20260908T150000,20261015T150000',
    )
  })

  it('sem datas puladas, não há linha de EXDATE', () => {
    expect(montarEvento(turma({ exdates: [] })).recurrence).toHaveLength(1)
  })

  it('ancora a recorrência no primeiro dia que é da turma', () => {
    // 02/09/2026 é quarta; a turma é terça e quinta. Se o start ficasse na
    // quarta, o Google criaria uma ocorrência num dia que a turma não tem.
    expect(montarEvento(turma()).start.dateTime.slice(0, 10)).toBe('2026-09-03')
  })

  it('começa na data de início escolhida, mesmo no passado', () => {
    expect(montarEvento(turma({ data_inicio: '2026-09-01' })).start.dateTime.slice(0, 10)).toBe(
      '2026-09-01',
    )
  })

  it('convida o professor, para a aula cair na agenda pessoal dele', () => {
    expect(montarEvento(turma()).attendees).toEqual([{ email: 'rafael@exemplo.com' }])
  })

  it('sem e-mail do professor, não inventa convidado', () => {
    expect(montarEvento(turma({ professor_email: null })).attendees).toBeUndefined()
  })

  it('a descrição diz quando a turma acontece e até quando', () => {
    const { description } = montarEvento(turma())
    expect(description).toContain('Terças e quintas, até 31/12/2026')
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
      frequencia: null,
      intervalo: null,
      dias_semana: [],
      data_inicio: null,
      data_fim: null,
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
  const regra = (over: Partial<RegraRecorrencia> = {}): RegraRecorrencia => ({
    frequencia: 'Semanal',
    intervalo: 1,
    dias_semana: [3],
    data_inicio: '2026-09-02', // quarta
    data_fim: '2026-12-31',
    ...over,
  })

  it('devolve o próprio dia quando ele já serve', () => {
    expect(primeiraOcorrencia(regra())).toBe('2026-09-02')
  })

  it('avança até o próximo dia da turma', () => {
    expect(primeiraOcorrencia(regra({ dias_semana: [5] }))).toBe('2026-09-04')
  })

  it('vira a semana quando o dia já passou', () => {
    expect(primeiraOcorrencia(regra({ dias_semana: [1] }))).toBe('2026-09-07')
  })

  it('atravessa a virada do mês', () => {
    expect(primeiraOcorrencia(regra({ dias_semana: [4], data_inicio: '2026-09-29' }))).toBe(
      '2026-10-01',
    )
  })

  it('sem dia da semana não há ocorrência', () => {
    expect(primeiraOcorrencia(regra({ dias_semana: [] }))).toBeNull()
  })

  it('período sem nenhuma ocorrência', () => {
    expect(primeiraOcorrencia(regra({ dias_semana: [1], data_fim: '2026-09-04' }))).toBeNull()
  })
})

describe('regraDoEvento', () => {
  it('única não tem regra', () => {
    expect(regraDoEvento(turma({ tipo_recorrencia: 'Único' }))).toBeNull()
  })

  it('recorrente sem período não tem regra', () => {
    expect(regraDoEvento(turma({ data_inicio: null }))).toBeNull()
  })
})

describe('exdatesDoEvento', () => {
  const regra: RegraRecorrencia = {
    frequencia: 'Semanal',
    intervalo: 1,
    dias_semana: [2, 4],
    data_inicio: '2026-09-01',
    data_fim: '2026-09-30',
  }

  it('feriado sem aula e aula excluída viram exceção; feriado com aula mantida não', () => {
    const r = exdatesDoEvento(
      regra,
      new Set(['2026-09-08', '2026-09-10', '2026-09-09']),
      [
        { data: '2026-09-10', status: 'Agendada' }, // tinha aluno: ficou
        { data: '2026-09-15', status: 'Excluída' },
      ],
    )
    // 09/09 é quarta: não é da regra, não entra.
    expect(r).toEqual(['2026-09-08', '2026-09-15'])
  })
})

describe('link da videochamada no evento (G3)', () => {
  const link = 'https://meet.google.com/abc-defg-hij'

  it('põe o link no local do evento, onde o professor clica', () => {
    expect(montarEvento(turma({ link_videochamada: link })).location).toBe(link)
  })

  it('repete o link na descrição', () => {
    expect(montarEvento(turma({ link_videochamada: link })).description).toContain(link)
  })

  it('sem link, o evento não ganha local', () => {
    expect(montarEvento(turma()).location).toBeUndefined()
  })
})

describe('alunos na descrição do evento', () => {
  it('lista os alunos na descrição', () => {
    const { description } = montarEvento(turma({ alunos: ['Ana Souza', 'Bruno Lima'] }))
    expect(description).toContain('Alunos matriculados (2):\n- Ana Souza\n- Bruno Lima')
  })

  it('sem alunos, diz que ainda não há ninguém', () => {
    expect(montarEvento(turma({ alunos: [] })).description).toContain('Nenhum aluno matriculado.')
  })

  it('aluno não vira convidado: só o professor é convidado', () => {
    // Convidado entraria direto na sala do Meet, sem passar pela sala de espera.
    const e = montarEvento(turma({ alunos: ['Ana Souza'] }))
    expect(e.attendees).toEqual([{ email: 'rafael@exemplo.com' }])
  })

  it('a descrição sozinha sai igual à do evento completo', () => {
    // A matrícula atualiza só a descrição: se as duas divergissem, salvar a
    // turma e matricular um aluno escreveriam textos diferentes.
    const t = turma({ alunos: ['Ana Souza'], link_videochamada: 'https://meet.google.com/x' })
    expect(descricaoDoEvento(t)).toBe(montarEvento(t).description)
  })
})
