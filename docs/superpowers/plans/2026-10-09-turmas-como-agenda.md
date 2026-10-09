# Turmas como agenda — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** turmas recorrentes com frequência (diária, semanal, quinzenal, mensal, personalizada), período (início e fim, com fim automático em 31/12 e renovação), aulas que pulam feriados e recessos, e exclusão de turma inteira ou de uma aula com transferência dos alunos para reposição.

**Arquitetura:** a turma guarda uma regra de recorrência; `materializar` deriva as aulas dela de forma pura e determinística, pulando feriados/recessos. No Google, um evento recorrente só, com `RRULE` (FREQ/INTERVAL/BYDAY/BYMONTHDAY/UNTIL) e `EXDATE`. Aula excluída vira status `Excluída` (a linha fica, para segurar as reposições e não ser recriada). A exclusão com transferência roda numa função do banco, numa transação.

**Stack:** Next.js 16 (App Router, server actions, `after()`), Supabase (Postgres + RLS, migrations via `npx supabase db push`), TypeScript, Vitest, Tailwind 4, `motion`.

**Especificação:** [docs/superpowers/specs/2026-10-09-turmas-como-agenda-design.md](../specs/2026-10-09-turmas-como-agenda-design.md)

---

## Regras do projeto (ler antes de começar)

| Regra | Por quê |
|---|---|
| Leia `AGENTS.md`. Este Next.js tem mudanças incompatíveis com o que você conhece; antes de usar uma API do Next que não aparece neste plano, leia o guia em `node_modules/next/dist/docs/`. | Instrução do projeto. |
| **Nunca `supabase db reset`.** Use `npx supabase db push < /dev/null`. | O projeto é remoto e vinculado: `reset` apaga o banco. |
| Comentários e mensagens em português, voltados para a gestora (dizem o que fazer, não o que falhou). | Padrão do código. |
| Datas em ISO `AAAA-MM-DD`; aritmética de dias em UTC (`Date.UTC`). "Hoje" no servidor vem de `agoraNaEscola(new Date()).slice(0, 10)`. | O servidor roda em UTC; a escola, em São Paulo. |
| Commits sem linha `Co-Authored-By` de IA. | Preferência do usuário. |
| Testes só de funções puras (`src/dominio/**`), com Vitest. Rodar com `npx vitest run <arquivo>`. | Padrão do projeto. |

---

## Estrutura de arquivos

**Novos**

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20261010000100_turmas_como_agenda.sql` | Colunas da regra na turma, status `Excluída`, origem `Exclusão`, backfill, constraint. |
| `supabase/migrations/20261010000200_excluir_aula.sql` | Função `excluir_aula` (transação da exclusão com transferências). |
| `src/dominio/agenda/recorrencia.ts` (+ `.test.ts`) | Regra de recorrência: datas, texto, fim automático, renovação, opção do formulário. |
| `src/dominio/agenda/datas-puladas.ts` (+ `.test.ts`) | Feriados/recessos → datas sem aula; alerta da data única. |
| `src/dominio/agenda/limpeza.ts` (+ `.test.ts`) | Quais aulas futuras sem vínculo saem quando regra/calendário muda. |
| `src/dominio/agenda/exclusao-aula.ts` (+ `.test.ts`) | Avaliação e validação da exclusão de uma aula. |
| `src/dominio/turmas/exclusao.ts` (+ `.test.ts`) | Regra da exclusão da turma inteira. |
| `src/dados/calendario.ts` | Lê feriados e recessos de um intervalo. |
| `src/dados/limpeza-aulas.ts` | Aplica a limpeza; reage a mudança de feriado/recesso. |
| `src/dados/exclusao-aula.ts` | Monta a situação da aula, o plano de reposições e chama a função do banco. |
| `src/app/(app)/agenda/aulas/[id]/ExcluirAula.tsx` | Janela "Excluir esta aula". |
| `src/app/(app)/turmas/RenovarTurmas.tsx` | Faixa "N turmas terminam em 31/12" com o botão de estender. |

**Modificados**

`src/dominio/tipos.ts`, `src/dominio/agenda/materializacao.ts`, `src/dominio/agenda/evento-google.ts`, `src/dominio/turmas/regras.ts`, `src/dominio/turmas/quando.ts`, `src/dominio/cobrancas/geracao.ts`, `src/dominio/reposicoes/desfecho.ts`, `src/agenda/provedor.ts`, `src/agenda/recorrencia-local.ts`, `src/dados/aulas.ts`, `src/dados/evento-da-turma.ts`, `src/dados/turmas.ts`, `src/dados/cobrancas.ts`, `src/dados/reposicoes.ts`, `src/dados/matriculas.ts`, `src/dados/notificacoes.ts`, `src/cadastros/motor/acoes.ts`, `src/app/(app)/cadastros/[cadastro]/acoes-feriados.ts`, `src/app/(app)/turmas/acoes.ts`, `src/app/(app)/turmas/FormularioTurma.tsx`, `src/app/(app)/turmas/page.tsx`, `src/app/(app)/turmas/[id]/page.tsx`, `src/app/(app)/turmas/[id]/ExcluirTurma.tsx` (só se o tipo da prévia mudar o uso), `src/app/(app)/agenda/acoes.ts`, `src/app/(app)/agenda/aulas/[id]/page.tsx`, `src/app/(app)/reposicoes/page.tsx`, `src/app/(app)/matriculas/nova/page.tsx`.

---

### Task 1: Migration — regra na turma, status `Excluída`, origem `Exclusão`

**Files:**
- Create: `supabase/migrations/20261010000100_turmas_como_agenda.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Rodada 4: turmas como agenda (spec 2026-10-09-turmas-como-agenda-design.md).
--
-- A turma recorrente passa a ter uma regra no desenho do Google Agenda:
-- frequencia + "a cada N" + periodo. O fim e sempre gravado; quando a gestora
-- nao informa, o sistema usa 31/12 e marca fim_automatico, para a renovacao
-- de fim de ano saber quais turmas oferecer.

create type public.frequencia_turma as enum ('Diária', 'Semanal', 'Mensal');

alter table public.turmas
  add column frequencia public.frequencia_turma,
  add column intervalo smallint,
  add column data_inicio date,
  add column data_fim date,
  add column fim_automatico boolean not null default false;

comment on column public.turmas.intervalo is
  '"A cada N" dias/semanas/meses. Quinzenal = Semanal com intervalo 2.';
comment on column public.turmas.data_inicio is
  'Primeiro dia da recorrencia. Pode ser anterior ao cadastro (aulas retroativas).';
comment on column public.turmas.fim_automatico is
  'true quando a gestora nao informou fim e o sistema usou 31/12. So estas entram na renovacao.';

-- Turmas que ja existem: semanais, desde o dia do cadastro (a regra que valia
-- ate aqui, decisao de 22/09/2026), ate o fim do ano.
update public.turmas
   set frequencia = 'Semanal',
       intervalo = 1,
       data_inicio = (created_at at time zone 'America/Sao_Paulo')::date,
       data_fim = '2026-12-31',
       fim_automatico = true
 where tipo_recorrencia = 'Recorrente';

alter table public.turmas drop constraint recorrencia_coerente;
alter table public.turmas add constraint recorrencia_coerente check (
  (tipo_recorrencia = 'Recorrente'
     and data_unica is null
     and frequencia is not null
     and intervalo between 1 and 99
     and data_inicio is not null
     and data_fim is not null
     and data_fim >= data_inicio
     -- Dia da semana so faz sentido na semanal; nas outras a data de inicio
     -- e que ancora a repeticao.
     and (case frequencia
            when 'Semanal' then status <> 'Ativa' or cardinality(dias_semana) >= 1
            else cardinality(dias_semana) = 0
          end))
  or
  (tipo_recorrencia = 'Único'
     and data_unica is not null
     and frequencia is null
     and intervalo is null
     and data_inicio is null
     and data_fim is null
     and not fim_automatico)
);

-- Aula excluida: a linha fica, para segurar as reposicoes que nasceram dela
-- (pendencias_reposicao.aula_origem_id e on delete cascade) e para a
-- materializacao (upsert com ignoreDuplicates) nao recria-la.
alter type public.status_aula add value if not exists 'Excluída';

-- Pendencia criada quando a aula do aluno e excluida pela gestora.
alter type public.origem_ausencia add value if not exists 'Exclusão';
```

- [ ] **Step 2: Aplicar no banco**

Run: `npx supabase db push < /dev/null`
Expected: `Applying migration 20261010000100_turmas_como_agenda.sql...` e `Finished supabase db push.`

Se falhar no `add constraint` por alguma turma existente, rode no SQL editor (ou via MCP `execute_sql`) `select id, tipo_recorrencia, status, dias_semana, data_unica from turmas where not (...)` com a mesma expressão para ver qual linha viola, e corrija o dado antes de repetir. Não afrouxe a constraint.

- [ ] **Step 3: Conferir o backfill**

Run (SQL): `select tipo_recorrencia, frequencia, intervalo, count(*), min(data_inicio), max(data_fim) from turmas group by 1,2,3;`
Expected: Recorrente → Semanal/1 com `data_fim = 2026-12-31`; Único → tudo nulo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261010000100_turmas_como_agenda.sql
git commit -m "feat(turmas): regra de recorrencia, periodo e status Excluida no banco"
```

---

### Task 2: Tipos compartilhados

**Files:**
- Modify: `src/dominio/tipos.ts`
- Modify: `src/dados/cobrancas.ts:92,165`, `src/dados/reposicoes.ts:18`, `src/dominio/cobrancas/geracao.ts:24`, `src/dominio/reposicoes/desfecho.ts:59`

- [ ] **Step 1: Acrescentar os tipos em `src/dominio/tipos.ts`**

Logo depois de `TipoRecorrencia`:

```ts
/** Rodada 4: de quanto em quanto a turma recorrente se repete. */
export const FREQUENCIAS = ['Diária', 'Semanal', 'Mensal'] as const
export type Frequencia = (typeof FREQUENCIAS)[number]
```

Trocar a linha de `STATUS_AULA` por:

```ts
export const STATUS_AULA = ['Agendada', 'Realizada', 'Cancelada', 'Feriado', 'Excluída'] as const
```

E acrescentar, depois de `StatusAula`:

```ts
/**
 * Por que o aluno não participou da aula. 'Exclusão' (Rodada 4): a gestora
 * excluiu a aula e o aluno foi para reposição.
 */
export const ORIGENS_AUSENCIA = ['Aviso', 'Falta', 'Exclusão'] as const
export type OrigemAusencia = (typeof ORIGENS_AUSENCIA)[number]
```

- [ ] **Step 2: Usar `OrigemAusencia` onde hoje está `'Aviso' | 'Falta'`**

Run: `grep -rn "'Aviso' | 'Falta'" src`
Em cada ocorrência (os cinco arquivos listados acima), troque `'Aviso' | 'Falta'` por `OrigemAusencia` e acrescente `import type { OrigemAusencia } from '@/dominio/tipos'` (ou junte ao import de `@/dominio/tipos` que já existir no arquivo).

- [ ] **Step 3: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/dominio/tipos.ts src/dados/cobrancas.ts src/dados/reposicoes.ts src/dominio/cobrancas/geracao.ts src/dominio/reposicoes/desfecho.ts
git commit -m "feat(tipos): frequencia da turma, status Excluida e origem Exclusao"
```

---

### Task 3: Regra de recorrência (domínio puro)

**Files:**
- Create: `src/dominio/agenda/recorrencia.ts`
- Test: `src/dominio/agenda/recorrencia.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, expect, it } from 'vitest'
import {
  datasDaRegra,
  deveOferecerRenovacao,
  fimAutomatico,
  fimRenovado,
  opcaoDaRegra,
  regraDaOpcao,
  resolverFim,
  somarDias,
  textoDaRegra,
  type RegraRecorrencia,
} from './recorrencia'

const regra = (over: Partial<RegraRecorrencia> = {}): RegraRecorrencia => ({
  frequencia: 'Semanal',
  intervalo: 1,
  dias_semana: [2, 4], // terça e quinta
  data_inicio: '2026-09-01', // uma terça
  data_fim: '2026-12-31',
  ...over,
})

describe('somarDias', () => {
  it('atravessa a virada do mês e do ano', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2026-09-01', -1)).toBe('2026-08-31')
  })
})

describe('datasDaRegra', () => {
  it('semanal: os dias escolhidos, toda semana', () => {
    expect(datasDaRegra(regra(), '2026-09-01', '2026-09-10')).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-08',
      '2026-09-10',
    ])
  })

  it('quinzenal: semana sim, semana não, contando da semana do início', () => {
    // 02/09/2026 é quarta. A semana dela (30/08 a 05/09) vale: só a quinta 03,
    // porque a terça 01 é antes do início. A seguinte não. A outra vale.
    const r = regra({ intervalo: 2, data_inicio: '2026-09-02' })
    expect(datasDaRegra(r, '2026-09-01', '2026-09-20')).toEqual([
      '2026-09-03',
      '2026-09-15',
      '2026-09-17',
    ])
  })

  it('quinzenal: abrir a janela no meio não muda a âncora', () => {
    const r = regra({ intervalo: 2, data_inicio: '2026-09-02' })
    expect(datasDaRegra(r, '2026-09-10', '2026-09-20')).toEqual(['2026-09-15', '2026-09-17'])
  })

  it('diária a cada 2 dias, inclusive fim de semana', () => {
    const r = regra({ frequencia: 'Diária', intervalo: 2, dias_semana: [] })
    expect(datasDaRegra(r, '2026-09-01', '2026-09-07')).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-05',
      '2026-09-07',
    ])
    expect(datasDaRegra(r, '2026-09-02', '2026-09-04')).toEqual(['2026-09-03'])
  })

  it('mensal: o mesmo dia do mês da data de início', () => {
    const r = regra({ frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-09-15' })
    expect(datasDaRegra(r, '2026-09-01', '2026-12-31')).toEqual([
      '2026-09-15',
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ])
  })

  it('mensal no dia 31 pula o mês que não tem 31, como o Google', () => {
    const r = regra({ frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-08-31' })
    expect(datasDaRegra(r, '2026-08-01', '2026-12-31')).toEqual([
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ])
  })

  it('mensal a cada 2 meses atravessa o ano', () => {
    const r = regra({
      frequencia: 'Mensal',
      intervalo: 2,
      dias_semana: [],
      data_inicio: '2026-09-15',
      data_fim: '2027-01-31',
    })
    expect(datasDaRegra(r, '2026-09-01', '2027-01-31')).toEqual([
      '2026-09-15',
      '2026-11-15',
      '2027-01-15',
    ])
  })

  it('para na data de fim', () => {
    expect(datasDaRegra(regra({ data_fim: '2026-09-03' }), '2026-09-01', '2026-09-30')).toEqual([
      '2026-09-01',
      '2026-09-03',
    ])
  })

  it('nada quando a janela está fora do período', () => {
    expect(datasDaRegra(regra(), '2027-01-01', '2027-01-31')).toEqual([])
    expect(datasDaRegra(regra(), '2026-08-01', '2026-08-31')).toEqual([])
  })

  it('é determinística', () => {
    expect(datasDaRegra(regra(), '2026-09-01', '2026-12-31')).toEqual(
      datasDaRegra(regra(), '2026-09-01', '2026-12-31'),
    )
  })
})

describe('textoDaRegra', () => {
  it('semanal', () => {
    expect(textoDaRegra(regra())).toBe('Terças e quintas')
    expect(textoDaRegra(regra({ dias_semana: [1] }))).toBe('Segunda-feira')
  })

  it('quinzenal e semanas personalizadas', () => {
    expect(textoDaRegra(regra({ intervalo: 2 }))).toBe('Terças e quintas, a cada 2 semanas')
  })

  it('segunda a sexta', () => {
    expect(textoDaRegra(regra({ dias_semana: [5, 4, 3, 2, 1] }))).toBe('De segunda a sexta')
  })

  it('diária', () => {
    expect(textoDaRegra(regra({ frequencia: 'Diária', dias_semana: [] }))).toBe('Todos os dias')
    expect(textoDaRegra(regra({ frequencia: 'Diária', intervalo: 3, dias_semana: [] }))).toBe(
      'A cada 3 dias',
    )
  })

  it('mensal', () => {
    const m = regra({ frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-09-15' })
    expect(textoDaRegra(m)).toBe('Todo dia 15 do mês')
    expect(textoDaRegra({ ...m, intervalo: 2 })).toBe('Dia 15, a cada 2 meses')
  })
})

describe('fim automático', () => {
  it('é 31/12 do ano corrente', () => {
    expect(fimAutomatico('2026-10-09', '2026-10-01')).toBe('2026-12-31')
  })

  it('turma que começa no ano seguinte vai até o fim daquele ano', () => {
    expect(fimAutomatico('2026-10-09', '2027-02-01')).toBe('2027-12-31')
  })
})

describe('resolverFim', () => {
  it('fim informado pela gestora vale e não é automático', () => {
    expect(resolverFim('2026-11-30', '2026-10-01', null, '2026-10-09')).toEqual({
      data_fim: '2026-11-30',
      fim_automatico: false,
    })
  })

  it('sem fim, o sistema usa 31/12', () => {
    expect(resolverFim(null, '2026-10-01', null, '2026-10-09')).toEqual({
      data_fim: '2026-12-31',
      fim_automatico: true,
    })
  })

  it('editar uma turma já renovada sem informar fim não a encurta', () => {
    const atual = { data_fim: '2027-12-31', fim_automatico: true }
    expect(resolverFim(null, '2026-10-01', atual, '2026-12-10')).toEqual({
      data_fim: '2027-12-31',
      fim_automatico: true,
    })
  })

  it('apagar o fim definido volta ao automático', () => {
    const atual = { data_fim: '2026-11-30', fim_automatico: false }
    expect(resolverFim(null, '2026-10-01', atual, '2026-10-09')).toEqual({
      data_fim: '2026-12-31',
      fim_automatico: true,
    })
  })
})

describe('renovação', () => {
  const t = {
    status: 'Ativa' as const,
    tipo_recorrencia: 'Recorrente' as const,
    fim_automatico: true,
    data_fim: '2026-12-31',
  }

  it('oferece em dezembro', () => {
    expect(deveOferecerRenovacao(t, '2026-12-05')).toBe(true)
  })

  it('não oferece com mais de um mês até o fim', () => {
    expect(deveOferecerRenovacao(t, '2026-10-09')).toBe(false)
  })

  it('continua oferecendo depois que acabou', () => {
    expect(deveOferecerRenovacao(t, '2027-01-10')).toBe(true)
  })

  it('não oferece para fim escolhido pela gestora, encerrada ou única', () => {
    expect(deveOferecerRenovacao({ ...t, fim_automatico: false }, '2026-12-05')).toBe(false)
    expect(deveOferecerRenovacao({ ...t, status: 'Encerrada' }, '2026-12-05')).toBe(false)
    expect(deveOferecerRenovacao({ ...t, tipo_recorrencia: 'Único' }, '2026-12-05')).toBe(false)
  })

  it('estende até o fim do ano seguinte', () => {
    expect(fimRenovado('2026-12-31', '2026-12-05')).toBe('2027-12-31')
  })

  it('se já acabou, estende até o fim do ano de hoje', () => {
    expect(fimRenovado('2026-12-31', '2027-01-10')).toBe('2027-12-31')
  })
})

describe('opção do formulário', () => {
  const r = (frequencia: 'Diária' | 'Semanal' | 'Mensal', intervalo: number, dias: number[]) => ({
    tipo_recorrencia: 'Recorrente' as const,
    frequencia,
    intervalo,
    dias_semana: dias,
  })

  it('reconhece cada opção a partir da regra gravada', () => {
    expect(opcaoDaRegra({ ...r('Semanal', 1, []), tipo_recorrencia: 'Único' })).toBe('Único')
    expect(opcaoDaRegra(r('Semanal', 1, [1, 2, 3, 4, 5]))).toBe('Diário')
    expect(opcaoDaRegra(r('Semanal', 1, [2, 4]))).toBe('Semanal')
    expect(opcaoDaRegra(r('Semanal', 2, [2, 4]))).toBe('Quinzenal')
    expect(opcaoDaRegra(r('Mensal', 1, []))).toBe('Mensal')
    expect(opcaoDaRegra(r('Semanal', 3, [2]))).toBe('Personalizado')
    expect(opcaoDaRegra(r('Diária', 1, []))).toBe('Personalizado')
    expect(opcaoDaRegra(r('Mensal', 2, []))).toBe('Personalizado')
  })

  it('converte cada opção pronta na regra', () => {
    expect(regraDaOpcao('Diário', [])).toEqual({
      frequencia: 'Semanal',
      intervalo: 1,
      dias_semana: [1, 2, 3, 4, 5],
    })
    expect(regraDaOpcao('Semanal', [2, 4])).toEqual({
      frequencia: 'Semanal',
      intervalo: 1,
      dias_semana: [2, 4],
    })
    expect(regraDaOpcao('Quinzenal', [2, 4])).toEqual({
      frequencia: 'Semanal',
      intervalo: 2,
      dias_semana: [2, 4],
    })
    expect(regraDaOpcao('Mensal', [2, 4])).toEqual({
      frequencia: 'Mensal',
      intervalo: 1,
      dias_semana: [],
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/agenda/recorrencia.test.ts`
Expected: FAIL — `Failed to resolve import "./recorrencia"`.

- [ ] **Step 3: Implementar**

```ts
import type { Frequencia, StatusTurma, TipoRecorrencia } from '@/dominio/tipos'

/**
 * Rodada 4: a regra de recorrência da turma, no desenho do Google Agenda —
 * "a cada N dias/semanas/meses", com início e fim.
 *
 * Datas em ISO (AAAA-MM-DD) e aritmética em UTC: o fuso nunca muda o dia no
 * meio da conta.
 */
export interface RegraRecorrencia {
  frequencia: Frequencia
  /** "A cada N". Sempre >= 1. */
  intervalo: number
  /** Só na Semanal. Mesmo índice de Date.getDay(): 0 = domingo. */
  dias_semana: number[]
  data_inicio: string
  data_fim: string
}

export function paraUTC(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

export function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function somarDias(iso: string, dias: number): string {
  const d = paraUTC(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraISO(d)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((paraUTC(ate).getTime() - paraUTC(de).getTime()) / 86_400_000)
}

const DIAS_UTEIS = [1, 2, 3, 4, 5]

const iguais = (a: number[], b: number[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

const ordenados = (dias: number[]) => [...new Set(dias)].sort((a, b) => a - b)

/**
 * As datas da regra dentro de [de, ate] e do período da turma, inclusive nas
 * pontas.
 *
 * A âncora é sempre a data de início, nunca a janela pedida: abrir a agenda em
 * outro mês não pode mudar qual semana do quinzenal vale.
 */
export function datasDaRegra(regra: RegraRecorrencia, de: string, ate: string): string[] {
  const inicio = de > regra.data_inicio ? de : regra.data_inicio
  const fim = ate < regra.data_fim ? ate : regra.data_fim
  if (inicio > fim) return []

  const intervalo = Math.max(1, Math.trunc(regra.intervalo))
  const ancora = paraUTC(regra.data_inicio)
  // A semana começa no domingo, como o WKST=SU que vai na RRULE do Google.
  const domingoDaAncora = somarDias(regra.data_inicio, -ancora.getUTCDay())
  const dias = new Set(regra.dias_semana)

  const datas: string[] = []
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    const data = paraUTC(d)

    if (regra.frequencia === 'Diária') {
      if (diasEntre(regra.data_inicio, d) % intervalo === 0) datas.push(d)
    } else if (regra.frequencia === 'Semanal') {
      const semana = Math.floor(diasEntre(domingoDaAncora, d) / 7)
      if (dias.has(data.getUTCDay()) && semana % intervalo === 0) datas.push(d)
    } else {
      const meses =
        (data.getUTCFullYear() - ancora.getUTCFullYear()) * 12 +
        (data.getUTCMonth() - ancora.getUTCMonth())
      if (data.getUTCDate() === ancora.getUTCDate() && meses % intervalo === 0) datas.push(d)
    }
  }

  return datas
}

const SINGULAR = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]
const PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados']

/** "Segunda-feira", "Segundas e quartas", "Segundas, quartas e sextas". */
export function listaDeDias(dias: number[]): string {
  const unicos = ordenados(dias)
  if (unicos.length === 0) return ''
  if (unicos.length === 1) return SINGULAR[unicos[0]]

  const nomes = unicos.map((d) => PLURAL[d])
  const lista = `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
  return `${lista[0].toUpperCase()}${lista.slice(1)}`
}

/** A regra por extenso, sem horário: "Terças e quintas, a cada 2 semanas". */
export function textoDaRegra(
  regra: Pick<RegraRecorrencia, 'frequencia' | 'intervalo' | 'dias_semana' | 'data_inicio'>,
): string {
  const n = Math.max(1, regra.intervalo)

  if (regra.frequencia === 'Diária') return n === 1 ? 'Todos os dias' : `A cada ${n} dias`

  if (regra.frequencia === 'Mensal') {
    const dia = Number(regra.data_inicio.slice(8, 10))
    return n === 1 ? `Todo dia ${dia} do mês` : `Dia ${dia}, a cada ${n} meses`
  }

  const dias = ordenados(regra.dias_semana)
  const base =
    n === 1 && iguais(dias, DIAS_UTEIS) ? 'De segunda a sexta' : listaDeDias(dias) || 'Toda semana'
  return n === 1 ? base : `${base}, a cada ${n} semanas`
}

/**
 * Sem fim informado, a turma vai até 31/12 do ano corrente — ou do ano em que
 * começa, se ela só começa no ano seguinte (senão nasceria sem aula).
 */
export function fimAutomatico(hoje: string, dataInicio: string): string {
  const ano = Math.max(Number(hoje.slice(0, 4)), Number(dataInicio.slice(0, 4)))
  return `${ano}-12-31`
}

export function resolverFim(
  informado: string | null,
  dataInicio: string,
  atual: { data_fim: string | null; fim_automatico: boolean } | null,
  hoje: string,
): { data_fim: string; fim_automatico: boolean } {
  if (informado) return { data_fim: informado, fim_automatico: false }

  const automatico = fimAutomatico(hoje, dataInicio)
  // Turma já renovada: salvá-la de novo sem informar fim não pode encurtá-la.
  if (atual?.fim_automatico && atual.data_fim && atual.data_fim > automatico) {
    return { data_fim: atual.data_fim, fim_automatico: true }
  }
  return { data_fim: automatico, fim_automatico: true }
}

/**
 * A faixa de renovação aparece a um mês do fim e continua depois dele: se a
 * gestora esqueceu em dezembro, em janeiro ainda dá para estender.
 */
export function deveOferecerRenovacao(
  turma: {
    status: StatusTurma
    tipo_recorrencia: TipoRecorrencia
    fim_automatico: boolean
    data_fim: string | null
  },
  hoje: string,
): boolean {
  if (turma.status !== 'Ativa' || turma.tipo_recorrencia !== 'Recorrente') return false
  if (!turma.fim_automatico || !turma.data_fim) return false
  return diasEntre(hoje, turma.data_fim) <= 31
}

export function fimRenovado(dataFim: string, hoje: string): string {
  const ano = dataFim < hoje ? Number(hoje.slice(0, 4)) : Number(dataFim.slice(0, 4)) + 1
  return `${ano}-12-31`
}

/** As opções do campo "Repetição" do formulário. */
export const OPCOES_REPETICAO = [
  'Único',
  'Diário',
  'Semanal',
  'Quinzenal',
  'Mensal',
  'Personalizado',
] as const
export type OpcaoRepeticao = (typeof OPCOES_REPETICAO)[number]

/** Qual opção mostrar ao editar uma turma, a partir da regra gravada. */
export function opcaoDaRegra(turma: {
  tipo_recorrencia: TipoRecorrencia
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[]
}): OpcaoRepeticao {
  if (turma.tipo_recorrencia === 'Único') return 'Único'

  const intervalo = turma.intervalo ?? 1
  const frequencia = turma.frequencia ?? 'Semanal'

  if (frequencia === 'Mensal' && intervalo === 1) return 'Mensal'
  if (frequencia === 'Semanal') {
    if (intervalo === 1 && iguais(ordenados(turma.dias_semana), DIAS_UTEIS)) return 'Diário'
    if (intervalo === 1) return 'Semanal'
    if (intervalo === 2) return 'Quinzenal'
  }
  return 'Personalizado'
}

/** A regra que cada opção pronta grava. "Diário" é de segunda a sexta. */
export function regraDaOpcao(
  opcao: 'Diário' | 'Semanal' | 'Quinzenal' | 'Mensal',
  dias: number[],
): { frequencia: Frequencia; intervalo: number; dias_semana: number[] } {
  switch (opcao) {
    case 'Diário':
      return { frequencia: 'Semanal', intervalo: 1, dias_semana: [...DIAS_UTEIS] }
    case 'Semanal':
      return { frequencia: 'Semanal', intervalo: 1, dias_semana: dias }
    case 'Quinzenal':
      return { frequencia: 'Semanal', intervalo: 2, dias_semana: dias }
    case 'Mensal':
      return { frequencia: 'Mensal', intervalo: 1, dias_semana: [] }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/agenda/recorrencia.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/recorrencia.ts src/dominio/agenda/recorrencia.test.ts
git commit -m "feat(agenda): regra de recorrencia com frequencia, intervalo e periodo"
```

---

### Task 4: Datas puladas por feriado e recesso

**Files:**
- Create: `src/dominio/agenda/datas-puladas.ts`
- Test: `src/dominio/agenda/datas-puladas.test.ts`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, expect, it } from 'vitest'
import { alertaDaData, datasPuladas } from './datas-puladas'

const feriados = [
  { data: '2026-10-12', nome: 'Nossa Senhora Aparecida' },
  { data: '2026-11-15', nome: 'Proclamação da República' },
]
const recessos = [
  { escola_id: 3, descricao: 'Férias de julho', data_inicio: '2026-07-20', data_fim: '2026-07-22' },
  { escola_id: 9, descricao: 'Recesso da outra escola', data_inicio: '2026-10-12', data_fim: '2026-10-14' },
]

describe('datasPuladas', () => {
  it('feriado vale para qualquer turma', () => {
    const p = datasPuladas(null, feriados, recessos, '2026-10-01', '2026-10-31')
    expect([...p.keys()]).toEqual(['2026-10-12'])
    expect(p.get('2026-10-12')).toEqual({ tipo: 'feriado', nome: 'Nossa Senhora Aparecida' })
  })

  it('recesso só vale para a escola dele, dia a dia', () => {
    const p = datasPuladas(3, [], recessos, '2026-07-01', '2026-07-31')
    expect([...p.keys()]).toEqual(['2026-07-20', '2026-07-21', '2026-07-22'])
    expect(p.get('2026-07-21')).toEqual({ tipo: 'recesso', nome: 'Férias de julho' })
  })

  it('turma sem escola nunca cai em recesso', () => {
    expect(datasPuladas(null, [], recessos, '2026-07-01', '2026-10-31').size).toBe(0)
  })

  it('no mesmo dia, o feriado é o motivo mostrado', () => {
    const p = datasPuladas(9, feriados, recessos, '2026-10-01', '2026-10-31')
    expect(p.get('2026-10-12')?.tipo).toBe('feriado')
    expect(p.get('2026-10-13')?.tipo).toBe('recesso')
  })

  it('recorta pela janela pedida', () => {
    const p = datasPuladas(3, feriados, recessos, '2026-07-21', '2026-07-21')
    expect([...p.keys()]).toEqual(['2026-07-21'])
  })
})

describe('alertaDaData', () => {
  it('avisa feriado', () => {
    expect(alertaDaData('2026-11-15', null, feriados, recessos)).toBe(
      '15/11/2026 é feriado (Proclamação da República).',
    )
  })

  it('avisa recesso da escola da turma', () => {
    expect(alertaDaData('2026-07-20', 3, feriados, recessos)).toBe(
      '20/07/2026 cai no recesso da escola (Férias de julho).',
    )
  })

  it('dia comum não tem alerta', () => {
    expect(alertaDaData('2026-11-16', 3, feriados, recessos)).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/agenda/datas-puladas.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
import type { Feriado } from './feriados'
import type { RecessoEscolar } from './recessos'
import { somarDias } from './recorrencia'

/**
 * Rodada 4: os dias em que a turma recorrente não tem aula, com o motivo.
 *
 * Feriado vale para todas as turmas; recesso só para a turma da escola dele —
 * a mesma regra do alerta de recesso (C2). Turma sem escola nunca cai em
 * recesso.
 */
export interface MotivoDaPulada {
  tipo: 'feriado' | 'recesso'
  nome: string
}

export function datasPuladas(
  escolaId: number | null,
  feriados: Feriado[],
  recessos: RecessoEscolar[],
  de: string,
  ate: string,
): Map<string, MotivoDaPulada> {
  const puladas = new Map<string, MotivoDaPulada>()

  if (escolaId !== null) {
    for (const r of recessos) {
      if (r.escola_id !== escolaId) continue
      const inicio = r.data_inicio > de ? r.data_inicio : de
      const fim = r.data_fim < ate ? r.data_fim : ate
      for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
        puladas.set(d, { tipo: 'recesso', nome: r.descricao })
      }
    }
  }

  // Depois do recesso: no mesmo dia, o nome do feriado explica melhor.
  for (const f of feriados) {
    if (f.data >= de && f.data <= ate) puladas.set(f.data, { tipo: 'feriado', nome: f.nome })
  }

  return puladas
}

/**
 * O aviso da turma de aula única marcada num feriado ou recesso. Só avisa: a
 * gestora pode criar mesmo assim (spec 4.3).
 */
export function alertaDaData(
  data: string,
  escolaId: number | null,
  feriados: Feriado[],
  recessos: RecessoEscolar[],
): string | null {
  const motivo = datasPuladas(escolaId, feriados, recessos, data, data).get(data)
  if (!motivo) return null

  const [ano, mes, dia] = data.split('-')
  const quando = `${dia}/${mes}/${ano}`
  return motivo.tipo === 'feriado'
    ? `${quando} é feriado (${motivo.nome}).`
    : `${quando} cai no recesso da escola (${motivo.nome}).`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/agenda/datas-puladas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/datas-puladas.ts src/dominio/agenda/datas-puladas.test.ts
git commit -m "feat(agenda): datas puladas por feriado e recesso"
```

---

### Task 5: `materializar` com regra, período e datas puladas

**Files:**
- Modify: `src/dominio/agenda/materializacao.ts`
- Test: `src/dominio/agenda/materializacao.test.ts`

- [ ] **Step 1: Ajustar os testes**

Em `materializacao.test.ts`:
1. Tire `dataDeCadastro` do import (e apague o `describe('dataDeCadastro', …)` se existir).
2. Apague o bloco `describe('turma recorrente começa no dia do cadastro', …)` inteiro.
3. Acrescente no fim:

```ts
// Rodada 4: a turma tem período e frequência, e pula feriado e recesso.
describe('regra, período e datas puladas', () => {
  const portugues: RecorrenciaTurma = {
    id: 27,
    frequencia: 'Semanal',
    intervalo: 1,
    dias_semana: [1, 3], // segunda e quarta
    data_inicio: '2026-09-22', // uma terça
    data_fim: '2026-10-07',
    horario_inicio: '20:00',
    horario_fim: '21:00',
    status: 'Ativa',
  }

  it('só gera dentro do período da turma', () => {
    const datas = materializar(portugues, '2026-09-01', '2026-10-31').map((o) => o.data)
    expect(datas).toEqual(['2026-09-23', '2026-09-28', '2026-09-30', '2026-10-05', '2026-10-07'])
  })

  it('início no passado gera as aulas retroativas', () => {
    const datas = materializar(
      { ...portugues, data_inicio: '2026-09-01' },
      '2026-09-01',
      '2026-09-07',
    ).map((o) => o.data)
    expect(datas).toEqual(['2026-09-02', '2026-09-07'])
  })

  it('pula as datas puladas', () => {
    const datas = materializar(
      portugues,
      '2026-09-01',
      '2026-10-31',
      new Set(['2026-09-28', '2026-10-05']),
    ).map((o) => o.data)
    expect(datas).toEqual(['2026-09-23', '2026-09-30', '2026-10-07'])
  })

  it('quinzenal pela frequência e intervalo', () => {
    const datas = materializar(
      { ...portugues, intervalo: 2, data_fim: '2026-10-31' },
      '2026-09-01',
      '2026-10-31',
    ).map((o) => o.data)
    // Semana do início (20 a 26/09) vale; a seguinte não; e assim por diante.
    expect(datas).toEqual(['2026-09-23', '2026-10-05', '2026-10-07', '2026-10-19', '2026-10-21'])
  })

  it('mensal não precisa de dia da semana', () => {
    const datas = materializar(
      { ...portugues, frequencia: 'Mensal', dias_semana: [], data_inicio: '2026-09-15', data_fim: '2026-11-30' },
      '2026-09-01',
      '2026-11-30',
    ).map((o) => o.data)
    expect(datas).toEqual(['2026-09-15', '2026-10-15', '2026-11-15'])
  })

  it('aula única nunca é pulada: a data foi escolhida de propósito', () => {
    const aulao: RecorrenciaTurma = {
      id: 42,
      tipo_recorrencia: 'Único',
      data_unica: '2026-11-15',
      dias_semana: [],
      horario_inicio: '14:00',
      horario_fim: '17:00',
      status: 'Ativa',
    }
    expect(materializar(aulao, '2026-11-01', '2026-11-30', new Set(['2026-11-15']))).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/agenda/materializacao.test.ts`
Expected: FAIL nos testes novos (período e puladas ainda ignorados).

- [ ] **Step 3: Implementar**

Substitua o conteúdo de `materializacao.ts` a partir do `import` até o fim por:

```ts
import type { Frequencia, StatusTurma, TipoRecorrencia } from '@/dominio/tipos'
import { datasDaRegra } from './recorrencia'

export interface RecorrenciaTurma {
  id: number
  /** T1: 'Único' acontece uma vez so, em `data_unica`. */
  tipo_recorrencia?: TipoRecorrencia
  /** Data em ISO (AAAA-MM-DD). So no modo Único. */
  data_unica?: string | null
  /** Rodada 4. Ausente = Semanal, como as turmas de antes. */
  frequencia?: Frequencia | null
  /** Rodada 4: "a cada N". Ausente = 1. */
  intervalo?: number | null
  /** Mesmo indice de Date.getDay(): 0 = domingo. */
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: StatusTurma
  /**
   * Rodada 4: período da recorrência, em ISO. Substitui o "não gerar antes do
   * dia do cadastro" (22/09/2026): agora a gestora escolhe o início, inclusive
   * no passado. Ausente = sem limite naquela ponta.
   */
  data_inicio?: string | null
  data_fim?: string | null
}

export interface OcorrenciaAula {
  /** Data em ISO, AAAA-MM-DD. */
  data: string
  horario_inicio: string
  horario_fim: string
  /**
   * Chave de idempotencia. Ressincronizar gera exatamente os mesmos ids, entao
   * o upsert por esta coluna nunca duplica aula. O prefixo `local:` distingue
   * do id que o Google Calendar devolve.
   */
  google_calendar_event_id: string
}

export function idOcorrenciaLocal(turmaId: number, data: string, horario: string): string {
  return `local:t${turmaId}:${data}T${horario}`
}

/**
 * Expande a recorrencia da turma nas ocorrencias que caem no intervalo
 * [de, ate], inclusive nas duas pontas, menos as `puladas` (feriados e
 * recessos — ver `datas-puladas.ts`).
 *
 * Puro e deterministico de proposito: e a propriedade que garante que
 * ressincronizar a agenda nao cria aula duplicada.
 */
export function materializar(
  turma: RecorrenciaTurma,
  de: string,
  ate: string,
  puladas: ReadonlySet<string> = new Set(),
): OcorrenciaAula[] {
  if (turma.status !== 'Ativa') return []
  if (de > ate) return []

  const ocorrencia = (data: string): OcorrenciaAula => ({
    data,
    horario_inicio: turma.horario_inicio,
    horario_fim: turma.horario_fim,
    google_calendar_event_id: idOcorrenciaLocal(turma.id, data, turma.horario_inicio),
  })

  // T1: turma que nao se repete rende no maximo uma aula, e so se a data dela
  // cair na janela pedida. Nunca e pulada: a gestora escolheu a data sabendo
  // do feriado (spec 4.3).
  if (turma.tipo_recorrencia === 'Único') {
    if (!turma.data_unica) return []
    if (turma.data_unica < de || turma.data_unica > ate) return []
    return [ocorrencia(turma.data_unica)]
  }

  const frequencia = turma.frequencia ?? 'Semanal'
  if (frequencia === 'Semanal' && turma.dias_semana.length === 0) return []

  const datas = datasDaRegra(
    {
      frequencia,
      intervalo: turma.intervalo ?? 1,
      dias_semana: turma.dias_semana,
      data_inicio: turma.data_inicio ?? de,
      data_fim: turma.data_fim ?? ate,
    },
    de,
    ate,
  )

  return datas.filter((d) => !puladas.has(d)).map(ocorrencia)
}
```

(`dataDeCadastro`, `paraUTC` e `paraISO` saem deste arquivo; quem usava `dataDeCadastro` é ajustado na Task 9.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/agenda/materializacao.test.ts`
Expected: PASS (os testes antigos de semanal e de data única continuam passando).

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/materializacao.ts src/dominio/agenda/materializacao.test.ts
git commit -m "feat(agenda): materializacao respeita periodo, frequencia e datas puladas"
```

---

### Task 6: "Quando" da turma com as novas frequências

**Files:**
- Modify: `src/dominio/turmas/quando.ts`
- Test: `src/dominio/turmas/quando.test.ts`

- [ ] **Step 1: Acrescentar testes** (dentro de `describe('quandoDaTurma', …)`)

```ts
  it('quinzenal diz o intervalo', () => {
    expect(quandoDaTurma(turma({ dias_semana: [2, 4], frequencia: 'Semanal', intervalo: 2 }))).toBe(
      'Terças e quintas, a cada 2 semanas, às 15:00',
    )
  })

  it('mensal diz o dia do mês', () => {
    expect(
      quandoDaTurma(
        turma({ dias_semana: [], frequencia: 'Mensal', intervalo: 1, data_inicio: '2026-09-15' }),
      ),
    ).toBe('Todo dia 15 do mês, às 15:00')
  })

  it('diária', () => {
    expect(quandoDaTurma(turma({ dias_semana: [], frequencia: 'Diária', intervalo: 1 }))).toBe(
      'Todos os dias, às 15:00',
    )
  })
```

E um `describe` novo:

```ts
describe('periodoDaTurma', () => {
  it('recorrente mostra início e fim', () => {
    expect(periodoDaTurma({ tipo_recorrencia: 'Recorrente', data_inicio: '2026-10-01', data_fim: '2026-12-31' })).toBe(
      'De 01/10/2026 a 31/12/2026',
    )
  })

  it('única ou sem período não mostra nada', () => {
    expect(periodoDaTurma({ tipo_recorrencia: 'Único', data_inicio: null, data_fim: null })).toBeNull()
  })
})
```

Acrescente `periodoDaTurma` ao import do topo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/turmas/quando.test.ts`
Expected: FAIL nos novos.

- [ ] **Step 3: Implementar** — substituir o arquivo `quando.ts` por:

```ts
import type { Frequencia } from '@/dominio/tipos'
import { textoDaRegra } from '@/dominio/agenda/recorrencia'

/**
 * Quando a turma acontece, por extenso: "Segundas e quartas, às 15:00".
 *
 * O nome da turma (matéria · ano · escola · serviço · modalidade) não tem dia
 * nem horário, então duas turmas iguais em horários diferentes ficavam com o
 * mesmo texto nas listas — e a gestora não tinha como saber em qual matricular.
 */

export interface TurmaComHorario {
  nome: string
  tipo_recorrencia: 'Recorrente' | 'Único'
  /** ISO (AAAA-MM-DD). Só no modo Único. */
  data_unica: string | null
  dias_semana: number[] | null
  /** HH:MM ou HH:MM:SS, como o banco devolve. */
  horario_inicio: string
  /** Rodada 4. Ausentes = semanal, como as turmas de antes. */
  frequencia?: Frequencia | null
  intervalo?: number | null
  data_inicio?: string | null
}

export function quandoDaTurma(turma: TurmaComHorario): string {
  const hora = `às ${turma.horario_inicio.slice(0, 5)}`

  if (turma.tipo_recorrencia === 'Único' && turma.data_unica) {
    const [, mes, dia] = turma.data_unica.split('-')
    return `Aula única em ${dia}/${mes}, ${hora}`
  }

  const frequencia = turma.frequencia ?? 'Semanal'
  const dias = turma.dias_semana ?? []
  if (frequencia === 'Semanal' && dias.length === 0) return `Às ${turma.horario_inicio.slice(0, 5)}`
  if (frequencia === 'Mensal' && !turma.data_inicio) return `Às ${turma.horario_inicio.slice(0, 5)}`

  const regra = textoDaRegra({
    frequencia,
    intervalo: turma.intervalo ?? 1,
    dias_semana: dias,
    data_inicio: turma.data_inicio ?? '',
  })
  return `${regra}, ${hora}`
}

/** Nome e quando juntos, para seletores e listas de turma. */
export function rotuloDaTurma(turma: TurmaComHorario): string {
  return `${turma.nome} — ${quandoDaTurma(turma)}`
}

const ddmmaaaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

/** "De 01/10/2026 a 31/12/2026". Só para recorrente com período. */
export function periodoDaTurma(turma: {
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_inicio: string | null
  data_fim: string | null
}): string | null {
  if (turma.tipo_recorrencia !== 'Recorrente' || !turma.data_inicio || !turma.data_fim) return null
  return `De ${ddmmaaaa(turma.data_inicio)} a ${ddmmaaaa(turma.data_fim)}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/turmas/quando.test.ts`
Expected: PASS (incluindo os testes antigos).

- [ ] **Step 5: Levar os campos novos às consultas que alimentam `quandoDaTurma`/`rotuloDaTurma`**

Run: `grep -rn "dias_semana, horario_inicio" src --include=*.ts --include=*.tsx`
Em cada `select` encontrado em `src/dados/turmas.ts` (`turmasResumidas`), `src/dados/matriculas.ts`, `src/dados/notificacoes.ts` e `src/app/(app)/matriculas/nova/page.tsx`, troque `dias_semana, horario_inicio` por `dias_semana, frequencia, intervalo, data_inicio, horario_inicio`. (Não mexa em `SELECT_TURMA` aqui; ele muda na Task 13.)

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/turmas/quando.ts src/dominio/turmas/quando.test.ts src/dados src/app
git commit -m "feat(turmas): quando da turma descreve frequencia e periodo"
```

---

### Task 7: Validação da turma

**Files:**
- Modify: `src/dominio/turmas/regras.ts`
- Test: `src/dominio/turmas/regras.test.ts`

- [ ] **Step 1: Ajustar a fixture e acrescentar testes**

Em `regras.test.ts`, acrescente em `turmaValida` (depois de `data_unica: null,`):

```ts
  frequencia: 'Semanal',
  intervalo: 1,
  data_inicio: '2026-10-01',
  data_fim: null,
```

Se algum teste antigo monta turma `Único`, ele continua válido (os campos novos não são conferidos no modo Único). Acrescente:

```ts
describe('validarTurma — regra e período (Rodada 4)', () => {
  it('exige data de início na recorrente', () => {
    expect(validarTurma({ ...turmaValida, data_inicio: null }, servicoCompleto)).toContain(
      'Informe quando a turma começa.',
    )
  })

  it('fim não pode ser antes do início', () => {
    expect(
      validarTurma({ ...turmaValida, data_fim: '2026-09-30' }, servicoCompleto),
    ).toContain('A data de término não pode ser antes da data de início.')
  })

  it('fim vazio é aceito: o sistema usa 31/12', () => {
    expect(validarTurma({ ...turmaValida, data_fim: null }, servicoCompleto)).toEqual([])
  })

  it('intervalo de 1 a 99', () => {
    const msg = 'O intervalo da repetição deve ser um número de 1 a 99.'
    expect(validarTurma({ ...turmaValida, intervalo: 0 }, servicoCompleto)).toContain(msg)
    expect(validarTurma({ ...turmaValida, intervalo: 100 }, servicoCompleto)).toContain(msg)
    expect(validarTurma({ ...turmaValida, intervalo: 1.5 }, servicoCompleto)).toContain(msg)
  })

  it('mensal e diária não usam dia da semana', () => {
    expect(
      validarTurma({ ...turmaValida, frequencia: 'Mensal', dias_semana: [2] }, servicoCompleto),
    ).toContain('Dias da semana só valem para repetição semanal.')
    expect(
      validarTurma({ ...turmaValida, frequencia: 'Mensal', dias_semana: [] }, servicoCompleto),
    ).toEqual([])
  })

  it('aula única ignora os campos da recorrente', () => {
    expect(
      validarTurma(
        {
          ...turmaValida,
          tipo_recorrencia: 'Único',
          data_unica: '2026-11-15',
          dias_semana: [],
          data_inicio: null,
        },
        servicoCompleto,
      ),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/turmas/regras.test.ts`
Expected: FAIL (erro de tipo nos campos novos e nas mensagens).

- [ ] **Step 3: Implementar**

Em `regras.ts`: troque o import por `import type { Frequencia, Modalidade, StatusTurma, TipoRecorrencia } from '@/dominio/tipos'`. Em `EntradaTurma`, depois de `data_unica`:

```ts
  /** Rodada 4: só na Recorrente. */
  frequencia: Frequencia | null
  /** "A cada N". Só na Recorrente. */
  intervalo: number | null
  /** ISO. Só na Recorrente; pode ser no passado. */
  data_inicio: string | null
  /** ISO. Vazio = o sistema usa 31/12 (fim automático). */
  data_fim: string | null
```

E troque o bloco `} else { … }` da recorrente por:

```ts
  } else {
    if (turma.data_unica) {
      erros.push('A data única só vale para uma aula que não se repete.')
    }
    if (!turma.data_inicio) erros.push('Informe quando a turma começa.')
    if (turma.data_inicio && turma.data_fim && turma.data_fim < turma.data_inicio) {
      erros.push('A data de término não pode ser antes da data de início.')
    }
    if (turma.frequencia === null) erros.push('Escolha de quanto em quanto a turma se repete.')
    if (
      turma.intervalo === null ||
      !Number.isInteger(turma.intervalo) ||
      turma.intervalo < 1 ||
      turma.intervalo > 99
    ) {
      erros.push('O intervalo da repetição deve ser um número de 1 a 99.')
    }
    if (turma.frequencia === 'Semanal') {
      if (turma.status === 'Ativa' && turma.dias_semana.length === 0) {
        erros.push('Escolha ao menos um dia da semana para ativar a turma.')
      }
    } else if (turma.dias_semana.length > 0) {
      erros.push('Dias da semana só valem para repetição semanal.')
    }
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/turmas/regras.test.ts`
Expected: PASS.

(`npx tsc --noEmit` vai acusar `FormularioTurma.tsx` sem os campos novos: é corrigido na Task 14. Não commite com `--no-verify`; se houver hook de tipos, faça as Tasks 7 e 14 no mesmo commit.)

- [ ] **Step 5: Commit**

```bash
git add src/dominio/turmas/regras.ts src/dominio/turmas/regras.test.ts
git commit -m "feat(turmas): valida frequencia, intervalo e periodo"
```

---

### Task 8: Evento do Google com RRULE completa e EXDATE

**Files:**
- Modify: `src/dominio/agenda/evento-google.ts`
- Test: `src/dominio/agenda/evento-google.test.ts`

- [ ] **Step 1: Reescrever o início dos testes**

Substitua tudo de `import { describe …` até o fim do `describe('primeiraOcorrencia', …)` (inclusive) por:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/agenda/evento-google.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar** — em `evento-google.ts`:

Imports no topo:

```ts
import type { Frequencia, StatusAula } from '@/dominio/tipos'
import { MARCA } from '@/marca'
import { datasDaRegra, somarDias, textoDaRegra, type RegraRecorrencia } from './recorrencia'
```

(`nomesDosDias` deixa de ser usado aqui; tire do import.)

`TurmaDoEvento` passa a ser:

```ts
export interface TurmaDoEvento {
  nome: string
  tipo_recorrencia: 'Recorrente' | 'Único'
  /** ISO (AAAA-MM-DD). Só no modo Único. */
  data_unica: string | null
  /** Rodada 4: a regra da recorrente (nulos na única). */
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[]
  /** Período da recorrência, em ISO. O evento começa na primeira data dele. */
  data_inicio: string | null
  data_fim: string | null
  /** Datas da regra que não têm aula no sistema (ver `exdatesDoEvento`). */
  exdates?: string[]
  /** HH:MM. */
  horario_inicio: string
  horario_fim: string
  modalidade: 'Presencial' | 'Online'
  professor_email: string | null
  /** Link do Meet (G3), quando a turma tem. */
  link_videochamada?: string | null
  /** Nomes dos alunos (ver `ocorrencias.ts`). Vão na descrição, nunca como convidados. */
  alunos: string[]
}
```

Troque `SIGLA_RRULE`, `montarEvento`, `descricaoDoEvento` e `primeiraOcorrencia` por:

```ts
/** Índice de `Date.getDay()` para a sigla que a RRULE usa. */
const SIGLA_RRULE = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const FREQ = { Diária: 'DAILY', Semanal: 'WEEKLY', Mensal: 'MONTHLY' } as const

const semHifen = (iso: string) => iso.split('-').join('')
const ddmmaaaa = (iso: string) => iso.split('-').reverse().join('/')

/** A regra da turma recorrente, ou null se faltar algo para montá-la. */
export function regraDoEvento(turma: TurmaDoEvento): RegraRecorrencia | null {
  if (turma.tipo_recorrencia !== 'Recorrente') return null
  if (!turma.data_inicio || !turma.data_fim) return null
  return {
    frequencia: turma.frequencia ?? 'Semanal',
    intervalo: turma.intervalo ?? 1,
    dias_semana: turma.dias_semana,
    data_inicio: turma.data_inicio,
    data_fim: turma.data_fim,
  }
}

/**
 * A primeira data da regra. O Google usa a data do `start` como âncora da
 * RRULE: se ela cair num dia que não é da recorrência, a primeira ocorrência
 * sai num dia que a turma não tem.
 */
export function primeiraOcorrencia(regra: RegraRecorrencia): string | null {
  return datasDaRegra(regra, regra.data_inicio, regra.data_fim)[0] ?? null
}

/**
 * Fim do último dia em São Paulo, em UTC — o formato que o Google exige no
 * UNTIL quando o evento tem fuso. São Paulo é UTC-3 o ano todo desde 2019.
 */
function untilUTC(dataFim: string): string {
  return `${semHifen(somarDias(dataFim, 1))}T025959Z`
}

function recorrenciaDoEvento(regra: RegraRecorrencia, horario: string, exdates: string[]): string[] {
  const partes = [`FREQ=${FREQ[regra.frequencia]}`]
  if (regra.intervalo > 1) partes.push(`INTERVAL=${regra.intervalo}`)
  if (regra.frequencia === 'Semanal') {
    // WKST=SU: o "a cada 2 semanas" conta a mesma semana que o sistema conta.
    const dias = [...regra.dias_semana].sort((a, b) => a - b).map((d) => SIGLA_RRULE[d])
    partes.push('WKST=SU', `BYDAY=${dias.join(',')}`)
  }
  if (regra.frequencia === 'Mensal') {
    partes.push(`BYMONTHDAY=${Number(regra.data_inicio.slice(8, 10))}`)
  }
  partes.push(`UNTIL=${untilUTC(regra.data_fim)}`)

  const linhas = [`RRULE:${partes.join(';')}`]
  if (exdates.length > 0) {
    const hora = `${horario.split(':').join('')}00`
    const datas = [...exdates].sort().map((d) => `${semHifen(d)}T${hora}`)
    linhas.push(`EXDATE;TZID=${FUSO}:${datas.join(',')}`)
  }
  return linhas
}

/**
 * As datas da regra que viram exceção no Google: as que não têm aula ativa no
 * sistema. Feriado/recesso em que a aula ficou (tinha aluno — spec 4.1) não
 * entra: o Google espelha o sistema, não o calendário.
 */
export function exdatesDoEvento(
  regra: RegraRecorrencia,
  puladas: ReadonlySet<string>,
  aulas: { data: string; status: StatusAula }[],
): string[] {
  const ativas = new Set(aulas.filter((a) => a.status !== 'Excluída').map((a) => a.data))
  const excluidas = new Set(aulas.filter((a) => a.status === 'Excluída').map((a) => a.data))
  return datasDaRegra(regra, regra.data_inicio, regra.data_fim).filter(
    (d) => !ativas.has(d) && (excluidas.has(d) || puladas.has(d)),
  )
}

export function montarEvento(turma: TurmaDoEvento): EventoGoogle {
  const unico = turma.tipo_recorrencia === 'Único'
  const regra = regraDoEvento(turma)
  const dia = unico ? turma.data_unica : regra ? primeiraOcorrencia(regra) : null

  if (!dia) {
    throw new Error(
      'Turma sem data: evento único exige data, recorrente exige uma regra com ao menos uma aula.',
    )
  }

  const evento: EventoGoogle = {
    summary: turma.nome,
    description: descricaoDoEvento(turma),
    start: { dateTime: `${dia}T${turma.horario_inicio}:00`, timeZone: FUSO },
    end: { dateTime: `${dia}T${turma.horario_fim}:00`, timeZone: FUSO },
  }

  // No local, o Google Agenda mostra o link clicável logo abaixo do horário.
  if (turma.link_videochamada) evento.location = turma.link_videochamada

  // Rodada 4: com UNTIL. A turma agora tem fim (escolhido ou 31/12), e a
  // renovação de fim de ano estende o evento junto.
  if (regra) evento.recurrence = recorrenciaDoEvento(regra, turma.horario_inicio, turma.exdates ?? [])

  // O professor entra como convidado para a aula aparecer na agenda pessoal
  // dele, além da agenda da empresa.
  if (turma.professor_email) {
    evento.attendees = [{ email: turma.professor_email }]
  }

  return evento
}

/**
 * Exportada à parte porque a matrícula atualiza só a descrição: mandar o
 * evento inteiro a cada matrícula reescreveria a série à toa.
 */
export function descricaoDoEvento(turma: TurmaDoEvento): string {
  const regra = regraDoEvento(turma)
  const quando =
    turma.tipo_recorrencia === 'Único'
      ? 'Aula única'
      : regra
        ? `${textoDaRegra(regra)}, até ${ddmmaaaa(regra.data_fim)}`
        : 'Aula recorrente'

  return [
    `${quando}, das ${turma.horario_inicio} às ${turma.horario_fim}.`,
    `Modalidade: ${turma.modalidade}.`,
    ...(turma.link_videochamada ? [`Link da aula: ${turma.link_videochamada}`] : []),
    '',
    ...(turma.alunos.length > 0
      ? [`Alunos matriculados (${turma.alunos.length}):`, ...turma.alunos.map((a) => `- ${a}`)]
      : ['Nenhum aluno matriculado.']),
    '',
    `Evento criado pelo ${MARCA}. Alterações feitas aqui podem ser`,
    'sobrescritas quando a turma ou uma matrícula for salva no sistema.',
  ].join('\n')
}
```

Atenção à ordem: `FUSO` é declarado antes de `recorrenciaDoEvento` (já está no topo do arquivo). `relogio.ts` importa `FUSO` daqui; `recorrencia.ts` não importa este arquivo, então não há ciclo.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/agenda/evento-google.test.ts`
Expected: PASS (inclusive os testes de G3 e de alunos, que usam a fixture nova).

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/evento-google.ts src/dominio/agenda/evento-google.test.ts
git commit -m "feat(agenda): evento do Google com frequencia, fim e excecoes"
```

---

### Task 9: Sincronização das aulas com regra e calendário

**Files:**
- Create: `src/dados/calendario.ts`
- Modify: `src/agenda/provedor.ts`, `src/agenda/recorrencia-local.ts`, `src/dados/aulas.ts`

- [ ] **Step 1: Criar `src/dados/calendario.ts`**

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Feriado } from '@/dominio/agenda/feriados'
import type { RecessoEscolar } from '@/dominio/agenda/recessos'

export interface CalendarioEscolar {
  feriados: Feriado[]
  recessos: RecessoEscolar[]
}

/**
 * Feriados e recessos que encostam em [de, ate]. Um recesso que começou antes
 * da janela continua valendo dentro dela.
 */
export async function calendarioEscolar(
  db: SupabaseClient,
  de: string,
  ate: string,
): Promise<CalendarioEscolar> {
  const [feriados, recessos] = await Promise.all([
    db.from('feriados').select('data, nome').gte('data', de).lte('data', ate),
    db
      .from('recessos_escola')
      .select('escola_id, descricao, data_inicio, data_fim')
      .lte('data_inicio', ate)
      .gte('data_fim', de),
  ])

  return {
    feriados: (feriados.data ?? []).map((f) => ({ data: String(f.data).slice(0, 10), nome: f.nome })),
    recessos: (recessos.data ?? []).map((r) => ({
      escola_id: r.escola_id,
      descricao: r.descricao,
      data_inicio: String(r.data_inicio).slice(0, 10),
      data_fim: String(r.data_fim).slice(0, 10),
    })),
  }
}
```

- [ ] **Step 2: Provedor recebe as datas puladas**

Em `src/agenda/provedor.ts`, a assinatura vira:

```ts
  listarOcorrencias(
    turma: TurmaParaSincronizar,
    de: string,
    ate: string,
    /** Rodada 4: feriados e recessos da turma na janela. */
    puladas?: ReadonlySet<string>,
  ): Promise<OcorrenciaAula[]>
```

Em `src/agenda/recorrencia-local.ts`:

```ts
  async listarOcorrencias(turma: TurmaParaSincronizar, de: string, ate: string, puladas?: ReadonlySet<string>) {
    return materializar(turma, de, ate, puladas)
  },
```

- [ ] **Step 3: `sincronizarAulas` em `src/dados/aulas.ts`**

Troque o import `import { dataDeCadastro } from '@/dominio/agenda/materializacao'` por:

```ts
import { datasPuladas } from '@/dominio/agenda/datas-puladas'
import { calendarioEscolar } from './calendario'
```

No `select` das turmas, troque a lista por:

```ts
    .select('id, tipo_recorrencia, data_unica, frequencia, intervalo, dias_semana, data_inicio, data_fim, horario_inicio, horario_fim, status, google_calendar_event_id, modalidade, escola_id')
```

Logo depois do `if (error) throw …`, leia o calendário uma vez:

```ts
  // Rodada 4: feriado e recesso tiram a aula da recorrente (spec 4).
  const calendario = await calendarioEscolar(supabase, de, ate)
```

E troque a chamada `provedor.listarOcorrencias({...}, de, ate)` por:

```ts
    const puladas = new Set(
      datasPuladas(turma.escola_id, calendario.feriados, calendario.recessos, de, ate).keys(),
    )
    const ocorrencias = await provedor.listarOcorrencias(
      {
        id: turma.id,
        tipo_recorrencia: turma.tipo_recorrencia,
        data_unica: turma.data_unica,
        frequencia: turma.frequencia,
        intervalo: turma.intervalo,
        dias_semana: turma.dias_semana ?? [],
        data_inicio: turma.data_inicio ? String(turma.data_inicio).slice(0, 10) : null,
        data_fim: turma.data_fim ? String(turma.data_fim).slice(0, 10) : null,
        horario_inicio: String(turma.horario_inicio).slice(0, 5),
        horario_fim: String(turma.horario_fim).slice(0, 5),
        status: 'Ativa',
        google_calendar_event_id: turma.google_calendar_event_id,
        modalidade: turma.modalidade,
      },
      de,
      ate,
      puladas,
    )
```

- [ ] **Step 4: Aula excluída sai das listas**

Em `AulaComTurma`, troque o tipo de `status` por `StatusAula` (`import type { StatusAula } from '@/dominio/tipos'`). Em `listarAulas`, logo depois de `.lte('data_hora_inicio', …)`:

```ts
    // Rodada 4: aula excluída fica no banco (segura as reposições), mas não
    // aparece na agenda.
    .neq('status', 'Excluída')
```

- [ ] **Step 5: Conferir**

Run: `grep -rn "dataDeCadastro\|cadastrada_em" src`
Expected: nada.

Run: `npx tsc --noEmit`
Expected: sem erros nestes arquivos (`evento-da-turma.ts` e `FormularioTurma.tsx` ainda podem acusar; são as Tasks 10 e 14).

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/dados/calendario.ts src/agenda src/dados/aulas.ts
git commit -m "feat(agenda): aulas recorrentes pulam feriado e recesso"
```

---

### Task 10: Evento da turma lê a regra e manda as exceções

**Files:**
- Modify: `src/dados/evento-da-turma.ts`

- [ ] **Step 1: Campos e tipo**

Troque `CAMPOS_TURMA` por:

```ts
const CAMPOS_TURMA =
  'id, nome, tipo_recorrencia, data_unica, frequencia, intervalo, dias_semana, data_inicio, data_fim, horario_inicio, horario_fim, modalidade, status, escola_id, google_calendar_event_id, link_videochamada, google_meet_sala, professor:professores!professor_id (email, google_calendar_id)'
```

E `TurmaLida` por:

```ts
type TurmaLida = {
  nome: string
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_unica: string | null
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[] | null
  data_inicio: string | null
  data_fim: string | null
  horario_inicio: string
  horario_fim: string
  modalidade: 'Presencial' | 'Online'
  escola_id: number | null
}
```

Imports novos:

```ts
import { calendarioEscolar } from './calendario'
import { datasPuladas } from '@/dominio/agenda/datas-puladas'
import { exdatesDoEvento, regraDoEvento } from '@/dominio/agenda/evento-google'
import type { Frequencia } from '@/dominio/tipos'
```

(junte `exdatesDoEvento` e `regraDoEvento` ao import de `@/dominio/agenda/evento-google` que já existe.)

- [ ] **Step 2: `eventoSemAlunos` sem o "início hoje"**

```ts
/** O evento da turma sem os alunos, que mudam de ocorrência para ocorrência. */
function eventoSemAlunos(
  turma: TurmaLida,
  professorEmail: string | null,
  link: string | null,
  exdates: string[] = [],
): Omit<TurmaDoEvento, 'alunos'> {
  const dia = (v: string | null) => (v ? String(v).slice(0, 10) : null)
  return {
    nome: turma.nome,
    tipo_recorrencia: turma.tipo_recorrencia,
    data_unica: turma.data_unica,
    frequencia: turma.frequencia,
    intervalo: turma.intervalo,
    dias_semana: turma.dias_semana ?? [],
    data_inicio: dia(turma.data_inicio),
    data_fim: dia(turma.data_fim),
    exdates,
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    modalidade: turma.modalidade,
    professor_email: professorEmail,
    link_videochamada: link,
  }
}

/**
 * Rodada 4: as datas da regra sem aula no sistema — feriado, recesso, aula
 * excluída —, que vão como EXDATE no Google.
 */
async function exdatesDaTurma(turmaId: number, turma: TurmaLida): Promise<string[]> {
  const regra = regraDoEvento({ ...eventoSemAlunos(turma, null, null), alunos: [] })
  if (!regra) return []

  const admin = clienteAdmin()
  const [calendario, { data: aulas }] = await Promise.all([
    calendarioEscolar(admin, regra.data_inicio, regra.data_fim),
    admin
      .from('aulas')
      .select('data_hora_inicio, status')
      .eq('turma_id', turmaId)
      .gte('data_hora_inicio', `${regra.data_inicio}T00:00:00`)
      .lte('data_hora_inicio', `${regra.data_fim}T23:59:59`),
  ])

  const puladas = new Set(
    datasPuladas(
      turma.escola_id,
      calendario.feriados,
      calendario.recessos,
      regra.data_inicio,
      regra.data_fim,
    ).keys(),
  )
  return exdatesDoEvento(
    regra,
    puladas,
    (aulas ?? []).map((a) => ({ data: String(a.data_hora_inicio).slice(0, 10), status: a.status })),
  )
}
```

- [ ] **Step 3: Usar nas duas chamadas**

Em `sincronizarEventoDaTurma`, troque o comentário "A recorrência começa hoje…" e a linha `const evento = eventoSemAlunos(turma, hojeISO(), …)` por:

```ts
  // Rodada 4: o evento começa na data de início da turma, que a gestora
  // escolheu (pode ser no passado), e leva as exceções do calendário.
  const evento = eventoSemAlunos(
    turma,
    professor?.email ?? null,
    link,
    await exdatesDaTurma(turmaId, turma),
  )
```

Em `atualizarAlunosNoEvento`, a linha vira (só a descrição muda; exceções não importam):

```ts
  const evento = eventoSemAlunos(turma, professor.email, turma.link_videochamada)
```

E troque o comentário "Mexer na série (o início muda para hoje) pode desfazer…" por "Mexer na série pode desfazer o que cada ocorrência tinha de próprio: confere todas de novo."

- [ ] **Step 4: Conferir**

Run: `npx tsc --noEmit`
Expected: só `FormularioTurma.tsx`/`turmas/acoes.ts` podem acusar (Tasks 13–14).

- [ ] **Step 5: Commit**

```bash
git add src/dados/evento-da-turma.ts
git commit -m "feat(agenda): evento da turma comeca no inicio escolhido e pula excecoes"
```

---

### Task 11: Limpeza de aulas (domínio puro)

**Files:**
- Create: `src/dominio/agenda/limpeza.ts`
- Test: `src/dominio/agenda/limpeza.test.ts`

- [ ] **Step 1: Testes**

```ts
import { describe, expect, it } from 'vitest'
import { aulasParaApagar, temAlunoNaData, type AulaParaLimpar } from './limpeza'

const aula = (over: Partial<AulaParaLimpar> = {}): AulaParaLimpar => ({
  id: 1,
  data: '2026-10-15',
  horario: '15:00',
  status: 'Agendada',
  vinculada: false,
  ...over,
})

const validas = new Set(['2026-10-13', '2026-10-15'])

describe('aulasParaApagar', () => {
  it('apaga a aula futura vazia que saiu da regra', () => {
    expect(aulasParaApagar([aula({ data: '2026-10-14' })], validas, '15:00', '2026-10-09')).toEqual([1])
  })

  it('mantém a aula que continua na regra', () => {
    expect(aulasParaApagar([aula()], validas, '15:00', '2026-10-09')).toEqual([])
  })

  it('apaga quando o horário da turma mudou', () => {
    expect(aulasParaApagar([aula()], validas, '16:00', '2026-10-09')).toEqual([1])
  })

  it('nunca apaga aula com vínculo: vai para o alerta da gestora', () => {
    expect(
      aulasParaApagar([aula({ data: '2026-10-14', vinculada: true })], validas, '15:00', '2026-10-09'),
    ).toEqual([])
  })

  it('não mexe no passado nem em aula já resolvida', () => {
    expect(
      aulasParaApagar(
        [aula({ id: 2, data: '2026-10-01' }), aula({ id: 3, data: '2026-10-14', status: 'Cancelada' })],
        validas,
        '15:00',
        '2026-10-09',
      ),
    ).toEqual([])
  })
})

describe('temAlunoNaData', () => {
  it('matrícula que cobre a data', () => {
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-10-01', data_fim: null }])).toBe(true)
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-10-15', data_fim: '2026-10-15' }])).toBe(true)
  })

  it('matrícula que acabou antes ou começa depois', () => {
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-09-01', data_fim: '2026-10-14' }])).toBe(false)
    expect(temAlunoNaData('2026-10-15', [{ data_inicio: '2026-10-16', data_fim: null }])).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/agenda/limpeza.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { StatusAula } from '@/dominio/tipos'

/**
 * Rodada 4: quais aulas futuras saem quando a regra da turma ou o calendário
 * (feriado, recesso) muda.
 *
 * Só sai a aula que ninguém tocou: Agendada, de hoje em diante, sem presença,
 * sem aluno na data, sem reposição apontando para ela e sem cobrança. A que
 * tem algum vínculo fica, e o alerta de conflito leva a decisão à gestora.
 */
export interface AulaParaLimpar {
  id: number
  /** ISO. */
  data: string
  /** HH:MM. */
  horario: string
  status: StatusAula
  /** Presença, aluno na data, reposição ou cobrança. */
  vinculada: boolean
}

export function aulasParaApagar(
  aulas: AulaParaLimpar[],
  datasValidas: ReadonlySet<string>,
  horarioDaTurma: string,
  hoje: string,
): number[] {
  return aulas
    .filter((a) => a.status === 'Agendada' && a.data >= hoje && !a.vinculada)
    .filter((a) => !(datasValidas.has(a.data) && a.horario === horarioDaTurma))
    .map((a) => a.id)
}

/** Alguma matrícula ativa cobre a data? */
export function temAlunoNaData(
  data: string,
  matriculas: { data_inicio: string; data_fim: string | null }[],
): boolean {
  return matriculas.some((m) => m.data_inicio <= data && (m.data_fim === null || m.data_fim >= data))
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/agenda/limpeza.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/limpeza.ts src/dominio/agenda/limpeza.test.ts
git commit -m "feat(agenda): regra de limpeza das aulas futuras sem vinculo"
```

---

### Task 12: Aplicar a limpeza; reagir a feriado e recesso

**Files:**
- Create: `src/dados/limpeza-aulas.ts`
- Modify: `src/cadastros/motor/acoes.ts`, `src/app/(app)/cadastros/[cadastro]/acoes-feriados.ts`

- [ ] **Step 1: Criar `src/dados/limpeza-aulas.ts`**

```ts
import 'server-only'
import { clienteAdmin } from './admin'
import { calendarioEscolar } from './calendario'
import { sincronizarEventoDaTurma } from './evento-da-turma'
import { datasPuladas } from '@/dominio/agenda/datas-puladas'
import { aulasParaApagar, temAlunoNaData } from '@/dominio/agenda/limpeza'
import { datasDaRegra } from '@/dominio/agenda/recorrencia'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import type { Frequencia } from '@/dominio/tipos'

type TurmaDaLimpeza = {
  id: number
  tipo_recorrencia: 'Recorrente' | 'Único'
  data_unica: string | null
  frequencia: Frequencia | null
  intervalo: number | null
  dias_semana: number[] | null
  data_inicio: string | null
  data_fim: string | null
  horario_inicio: string
  escola_id: number | null
  status: 'Ativa' | 'Encerrada'
}

const dia = (v: unknown) => String(v).slice(0, 10)

/** As datas em que a turma deve ter aula entre `de` e `ate`. */
async function datasValidas(turma: TurmaDaLimpeza, de: string, ate: string): Promise<Set<string>> {
  if (turma.tipo_recorrencia === 'Único') {
    return new Set(turma.data_unica ? [dia(turma.data_unica)] : [])
  }
  if (!turma.frequencia || !turma.data_inicio || !turma.data_fim) return new Set()

  const calendario = await calendarioEscolar(clienteAdmin(), de, ate)
  const puladas = datasPuladas(turma.escola_id, calendario.feriados, calendario.recessos, de, ate)
  const regra = {
    frequencia: turma.frequencia,
    intervalo: turma.intervalo ?? 1,
    dias_semana: turma.dias_semana ?? [],
    data_inicio: dia(turma.data_inicio),
    data_fim: dia(turma.data_fim),
  }
  return new Set(datasDaRegra(regra, de, ate).filter((d) => !puladas.has(d)))
}

/**
 * Apaga as aulas futuras sem vínculo que não cabem mais na turma (spec 4.1 e
 * 4.2). Devolve quantas saíram.
 */
export async function limparAulasDaTurma(turmaId: number): Promise<number> {
  const db = clienteAdmin()
  const hoje = agoraNaEscola(new Date()).slice(0, 10)

  const { data: turma } = await db
    .from('turmas')
    .select('id, tipo_recorrencia, data_unica, frequencia, intervalo, dias_semana, data_inicio, data_fim, horario_inicio, escola_id, status')
    .eq('id', turmaId)
    .maybeSingle()
  if (!turma || turma.status !== 'Ativa') return 0

  const { data: aulas } = await db
    .from('aulas')
    .select('id, data_hora_inicio, status')
    .eq('turma_id', turmaId)
    .eq('status', 'Agendada')
    .gte('data_hora_inicio', `${hoje}T00:00:00`)
  if (!aulas || aulas.length === 0) return 0

  const ids = aulas.map((a) => a.id as number)
  const ultima = aulas.map((a) => dia(a.data_hora_inicio)).reduce((a, b) => (b > a ? b : a))

  const [validas, presencas, origem, destino, cobradas, matriculas] = await Promise.all([
    datasValidas(turma as TurmaDaLimpeza, hoje, ultima),
    db.from('presencas').select('aula_id').in('aula_id', ids),
    db.from('pendencias_reposicao').select('aula_origem_id').in('aula_origem_id', ids),
    db.from('pendencias_reposicao').select('aula_reposicao_id').in('aula_reposicao_id', ids),
    db.from('itens_cobranca').select('aula_id').in('aula_id', ids),
    db.from('matriculas').select('data_inicio, data_fim').eq('turma_id', turmaId).eq('status', 'Ativa'),
  ])

  const tocadas = new Set<number>([
    ...(presencas.data ?? []).map((p) => p.aula_id as number),
    ...(origem.data ?? []).map((p) => p.aula_origem_id as number),
    ...(destino.data ?? []).map((p) => p.aula_reposicao_id as number),
    ...(cobradas.data ?? []).map((p) => p.aula_id as number),
  ])
  const mats = (matriculas.data ?? []).map((m) => ({
    data_inicio: dia(m.data_inicio),
    data_fim: m.data_fim ? dia(m.data_fim) : null,
  }))

  const apagar = aulasParaApagar(
    aulas.map((a) => {
      const data = dia(a.data_hora_inicio)
      return {
        id: a.id as number,
        data,
        horario: String(a.data_hora_inicio).slice(11, 16),
        status: a.status,
        vinculada: tocadas.has(a.id as number) || temAlunoNaData(data, mats),
      }
    }),
    validas,
    String(turma.horario_inicio).slice(0, 5),
    hoje,
  )
  if (apagar.length === 0) return 0

  const { error } = await db.from('aulas').delete().in('id', apagar)
  if (error) throw new Error(`Falha ao limpar aulas: ${error.message}`)
  return apagar.length
}

/**
 * Feriado ou recesso cadastrado/alterado (spec 4.1): tira as aulas vazias que
 * caíram nele e refaz as exceções do evento no Google. Recesso só atinge
 * turma com escola. Roda em `after()`: nada aqui pode derrubar o cadastro.
 */
export async function aplicarMudancaDeCalendario(escopo: 'feriado' | 'recesso'): Promise<void> {
  let consulta = clienteAdmin()
    .from('turmas')
    .select('id')
    .eq('status', 'Ativa')
    .eq('tipo_recorrencia', 'Recorrente')
  if (escopo === 'recesso') consulta = consulta.not('escola_id', 'is', null)

  const { data: turmas } = await consulta

  // Uma por vez: o Google limita a taxa de escrita por usuário.
  for (const t of turmas ?? []) {
    try {
      await limparAulasDaTurma(t.id)
      const r = await sincronizarEventoDaTurma(t.id)
      if (!r.ok) console.warn(`evento da turma ${t.id} nao atualizado:`, r.motivo)
    } catch (e) {
      console.error(`falha ao aplicar o ${escopo} na turma ${t.id}:`, e)
    }
  }
}
```

- [ ] **Step 2: Ligar no cadastro de feriado e recesso**

Em `src/cadastros/motor/acoes.ts`, importe `import { aplicarMudancaDeCalendario } from '@/dados/limpeza-aulas'` e, logo depois do bloco `if (rota === 'alunos' && id !== null) { … }`:

```ts
    // Rodada 4: a turma recorrente não tem aula em feriado nem em recesso.
    if (rota === 'feriados' || rota === 'recessos') {
      after(() => aplicarMudancaDeCalendario(rota === 'feriados' ? 'feriado' : 'recesso'))
      revalidatePath('/agenda')
    }
```

Em `src/app/(app)/cadastros/[cadastro]/acoes-feriados.ts`, importe `import { after } from 'next/server'` e `import { aplicarMudancaDeCalendario } from '@/dados/limpeza-aulas'`, e logo antes do `revalidatePath('/cadastros/feriados')` final:

```ts
  after(() => aplicarMudancaDeCalendario('feriado'))
```

- [ ] **Step 3: Conferir**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/dados/limpeza-aulas.ts src/cadastros/motor/acoes.ts "src/app/(app)/cadastros/[cadastro]/acoes-feriados.ts"
git commit -m "feat(agenda): feriado ou recesso novo tira as aulas vazias e atualiza o Google"
```

---

### Task 13: Salvar a turma com regra e período

**Files:**
- Modify: `src/dados/turmas.ts`, `src/app/(app)/turmas/acoes.ts`

- [ ] **Step 1: `src/dados/turmas.ts`**

Em `SELECT_TURMA`, troque `id, nome, modalidade, tipo_recorrencia, data_unica,` por:

```
  id, nome, modalidade, tipo_recorrencia, data_unica,
  frequencia, intervalo, data_inicio, data_fim, fim_automatico,
```

Em `TurmaComRelacoes`, depois de `data_unica`:

```ts
  frequencia: Frequencia | null
  intervalo: number | null
  data_inicio: string | null
  data_fim: string | null
  fim_automatico: boolean
```

(com `import type { Frequencia } from '@/dominio/tipos'`).

Em `OpcoesDeTurma`, acrescente:

```ts
  /** Rodada 4: para o resumo do formulário e o alerta da aula única. */
  feriados: Feriado[]
  recessos: RecessoEscolar[]
```

E em `opcoesDeTurma()`, depois do `Promise.all`:

```ts
  // Um ano para trás (início retroativo) e dois para a frente.
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const ano = Number(hoje.slice(0, 4))
  const calendario = await calendarioEscolar(supabase, `${ano - 1}-01-01`, `${ano + 2}-12-31`)
```

e no `return` acrescente `feriados: calendario.feriados, recessos: calendario.recessos,`. Imports: `calendarioEscolar` de `./calendario`, `agoraNaEscola` de `@/dominio/agenda/relogio`, tipos `Feriado` de `@/dominio/agenda/feriados` e `RecessoEscolar` de `@/dominio/agenda/recessos`.

- [ ] **Step 2: `salvarTurma` em `src/app/(app)/turmas/acoes.ts`**

Imports novos:

```ts
import { limparAulasDaTurma } from '@/dados/limpeza-aulas'
import { resolverFim } from '@/dominio/agenda/recorrencia'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
```

Depois de `if (erros.length > 0) return { ok: false, erros }`:

```ts
  const hojeISO = agoraNaEscola(new Date()).slice(0, 10)
  const recorrente = entrada.tipo_recorrencia === 'Recorrente'

  // Turma já renovada: salvar de novo sem informar fim não pode encurtá-la.
  let atual: { data_fim: string | null; fim_automatico: boolean } | null = null
  if (id !== null && recorrente) {
    const { data } = await supabase
      .from('turmas')
      .select('data_fim, fim_automatico')
      .eq('id', id)
      .maybeSingle()
    if (data) {
      atual = { data_fim: data.data_fim ? String(data.data_fim) : null, fim_automatico: data.fim_automatico }
    }
  }
  const fim = recorrente ? resolverFim(entrada.data_fim, entrada.data_inicio!, atual, hojeISO) : null
```

No objeto `registro`, troque `dias_semana: entrada.dias_semana,` por:

```ts
    // Rodada 4: os campos da regra só existem na recorrente (constraint
    // recorrencia_coerente); dia da semana, só na semanal.
    frequencia: recorrente ? entrada.frequencia : null,
    intervalo: recorrente ? entrada.intervalo : null,
    data_inicio: recorrente ? entrada.data_inicio : null,
    data_fim: fim?.data_fim ?? null,
    fim_automatico: fim?.fim_automatico ?? false,
    dias_semana: recorrente && entrada.frequencia === 'Semanal' ? entrada.dias_semana : [],
```

E troque o bloco `try { const hoje = new Date() … await sincronizarAulas(iso(hoje), iso(fim)) }` por:

```ts
  try {
    // Rodada 4: editar a regra tira as aulas futuras vazias que não cabem
    // mais nela (spec 4.2). Na criação não há o que limpar.
    if (id !== null) await limparAulasDaTurma(resposta.data.id)

    const hoje = new Date()
    const fimJanela = new Date(hoje.getFullYear(), hoje.getMonth() + 4, 0)
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // Início retroativo: as aulas passadas também nascem na hora.
    const primeira = (recorrente ? entrada.data_inicio : entrada.data_unica) ?? hojeISO
    await sincronizarAulas(primeira < hojeISO ? primeira : hojeISO, iso(fimJanela))
  } catch (e) {
```

(mantém o `catch` existente.)

- [ ] **Step 3: Conferir**

Run: `npx tsc --noEmit`
Expected: só `FormularioTurma.tsx` acusa (Task 14).

- [ ] **Step 4: Commit**

```bash
git add src/dados/turmas.ts "src/app/(app)/turmas/acoes.ts"
git commit -m "feat(turmas): grava regra, periodo e fim automatico ao salvar"
```

---

### Task 14: Formulário da turma

**Files:**
- Modify: `src/app/(app)/turmas/FormularioTurma.tsx`

- [ ] **Step 1: Imports e estado**

Troque os imports de domínio por:

```ts
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
```

Acima do componente:

```ts
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
```

No `useState<EntradaTurma>`, depois de `data_unica`:

```ts
    frequencia: turma?.frequencia ?? 'Semanal',
    intervalo: turma?.intervalo ?? 1,
    data_inicio: turma?.data_inicio ?? hojeNaEscola(),
    // Fim automático aparece vazio: o sistema decide ao salvar.
    data_fim: turma && !turma.fim_automatico ? turma.data_fim : null,
```

Depois do estado:

```ts
  const [opcao, setOpcao] = useState<OpcaoRepeticao>(() =>
    opcaoDaRegra({
      tipo_recorrencia: turma?.tipo_recorrencia ?? 'Recorrente',
      frequencia: turma?.frequencia ?? 'Semanal',
      intervalo: turma?.intervalo ?? 1,
      dias_semana: turma?.dias_semana ?? [],
    }),
  )
  const [confirmouData, setConfirmouData] = useState(false)
```

- [ ] **Step 2: Trocar `trocarRecorrencia` por `escolherOpcao` e acrescentar `escolherUnidade`**

```ts
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
```

- [ ] **Step 3: Resumo e alerta**

Depois de `nomeGerado`:

```ts
  const recorrente = estado.tipo_recorrencia === 'Recorrente'
  const fimPrevisto =
    estado.data_fim ?? (estado.data_inicio ? fimAutomatico(hojeNaEscola(), estado.data_inicio) : null)

  // Rodada 4: o que a gestora vai lançar, antes de salvar.
  const resumo = useMemo(() => {
    if (!recorrente || !estado.data_inicio || !fimPrevisto || !estado.frequencia) return null
    if (!estado.intervalo || estado.intervalo < 1 || fimPrevisto < estado.data_inicio) return null
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
  }, [recorrente, estado, fimPrevisto, opcoes.feriados, opcoes.recessos])

  const alerta =
    !recorrente && estado.data_unica
      ? alertaDaData(estado.data_unica, estado.escola_id, opcoes.feriados, opcoes.recessos)
      : null

  const mostraDias =
    opcao === 'Semanal' || opcao === 'Quinzenal' || (opcao === 'Personalizado' && estado.frequencia === 'Semanal')
```

Em `enviar`, logo depois de `setErros([])`:

```ts
    // Spec 4.3: aula única em feriado só com a confirmação da gestora.
    if (alerta && !confirmouData) {
      setErros(['Confirme que a aula vai acontecer mesmo assim, ou escolha outra data.'])
      return
    }
```

- [ ] **Step 4: Substituir o JSX de "Repetição" até o fim do campo "Dias da semana"**

Troque o bloco que vai de `{/* T1: mesma escolha do Google Agenda …` até o `)}` que fecha o ternário `estado.tipo_recorrencia === 'Único' ? … : …` por:

```tsx
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
              <Campo etiqueta="Repete a cada" obrigatorio>
                <div className="flex gap-2">
                  <input
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
```

Se a classe `bg-alerta-suave` não existir no tema, use a mesma do aviso de feriado da agenda: `grep -rn "suave" src/app/globals.css` e escolha o token de alerta existente (não invente cor).

- [ ] **Step 5: Conferir**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/turmas/FormularioTurma.tsx"`
Expected: sem erros.

- [ ] **Step 6: Ver funcionando**

Rode `npm run dev`, entre como gestora, abra `/turmas/nova`:
- "Quinzenal" + Ter/Qui + começa em uma quarta → resumo mostra "Terças e quintas, a cada 2 semanas, de … a 31/12/AAAA: N aulas".
- Com escola que tem recesso e/ou feriado no período → "(M datas puladas…)".
- "Não se repete" numa data de feriado → alerta; salvar sem marcar a caixa → mensagem; marcando → salva.
- Salve uma turma e confira a agenda: não há aula nos feriados.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/turmas/FormularioTurma.tsx"
git commit -m "feat(turmas): formulario com frequencia, periodo e resumo das aulas"
```

---

### Task 15: Exibição e renovação de fim de ano

**Files:**
- Create: `src/app/(app)/turmas/RenovarTurmas.tsx`
- Modify: `src/app/(app)/turmas/acoes.ts`, `src/app/(app)/turmas/page.tsx`, `src/app/(app)/turmas/[id]/page.tsx`

- [ ] **Step 1: Ação `estenderTurmas` em `turmas/acoes.ts`**

Imports: junte `deveOferecerRenovacao, fimRenovado` ao import de `@/dominio/agenda/recorrencia`.

```ts
/**
 * Rodada 4: estende até o fim do ano seguinte as turmas com fim automático.
 * Confere de novo no servidor quais podem: a lista veio da tela.
 */
export async function estenderTurmas(ids: number[]): Promise<{ ok: boolean; erro?: string }> {
  await exigirGestora()
  const supabase = await clienteServidor()
  const hoje = agoraNaEscola(new Date()).slice(0, 10)

  const { data: turmas, error } = await supabase
    .from('turmas')
    .select('id, status, tipo_recorrencia, fim_automatico, data_fim')
    .in('id', ids)
  if (error) return { ok: false, erro: error.message }

  const alvo = (turmas ?? [])
    .map((t) => ({ ...t, data_fim: t.data_fim ? String(t.data_fim) : null }))
    .filter((t) => deveOferecerRenovacao(t, hoje))

  for (const t of alvo) {
    const { error: erro } = await supabase
      .from('turmas')
      .update({ data_fim: fimRenovado(t.data_fim!, hoje) })
      .eq('id', t.id)
    if (erro) return { ok: false, erro: erro.message }
  }

  // O evento de cada turma ganha o novo UNTIL e as exceções do ano novo.
  after(async () => {
    for (const t of alvo) {
      try {
        const r = await sincronizarEventoDaTurma(t.id)
        if (!r.ok) console.warn(`evento da turma ${t.id} nao estendido:`, r.motivo)
      } catch (e) {
        console.error(`falha ao estender o evento da turma ${t.id}:`, e)
      }
    }
  })

  revalidatePath('/turmas')
  revalidatePath('/agenda')
  return { ok: true }
}
```

- [ ] **Step 2: Componente `RenovarTurmas.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { estenderTurmas } from './acoes'
import { Botao } from '@/ui/Botao'

/**
 * Rodada 4: turma sem fim escolhido vai até 31/12. Em dezembro a gestora
 * estende — de preferência depois de cadastrar os feriados do ano novo, para
 * eles já saírem da agenda.
 */
export function RenovarTurmas({ ids, ano, fim }: { ids: number[]; ano: string; fim: string }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-campo bg-superficie-2 px-4 py-3">
      <p>
        {ids.length} {ids.length === 1 ? 'turma termina' : 'turmas terminam'} em {fim}. Cadastre os
        feriados de {ano} e estenda:
      </p>
      <Botao
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null)
            const r = await estenderTurmas(ids)
            if (r.ok) router.refresh()
            else setErro(r.erro ?? 'Não foi possível estender.')
          })
        }
      >
        {pendente ? 'Estendendo…' : `Estender até dez/${ano}`}
      </Botao>
      {erro && <p role="alert" className="w-full text-sm text-erro">{erro}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Lista de turmas (`turmas/page.tsx`)**

Imports: `import { RenovarTurmas } from './RenovarTurmas'`, `import { deveOferecerRenovacao, fimRenovado, textoDaRegra } from '@/dominio/agenda/recorrencia'`, `import { agoraNaEscola } from '@/dominio/agenda/relogio'`, `import { periodoDaTurma } from '@/dominio/turmas/quando'`; tire `nomesDosDias` do import de `@/dominio/tipos`.

Depois de `const opcoes = await opcoesDeTurma()`:

```ts
  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const paraRenovar = ehGestora ? turmas.filter((t) => deveOferecerRenovacao(t, hoje)) : []
  const novoFim = paraRenovar[0]?.data_fim ? fimRenovado(paraRenovar[0].data_fim, hoje) : null
```

Logo depois do `</header>`:

```tsx
      {paraRenovar.length > 0 && novoFim && (
        <RenovarTurmas
          ids={paraRenovar.map((t) => t.id)}
          ano={novoFim.slice(0, 4)}
          fim={paraRenovar[0].data_fim!.split('-').reverse().join('/')}
        />
      )}
```

No cartão, troque o `<div>` com `nomesDosDias(turma.dias_semana)` por:

```tsx
                  <div>
                    {turma.tipo_recorrencia === 'Único' && turma.data_unica
                      ? `Aula única em ${turma.data_unica.split('-').reverse().join('/')}`
                      : textoDaRegra({
                          frequencia: turma.frequencia ?? 'Semanal',
                          intervalo: turma.intervalo ?? 1,
                          dias_semana: turma.dias_semana,
                          data_inicio: turma.data_inicio ?? '',
                        })}{' '}
                    · {turma.horario_inicio.slice(0, 5)} às {turma.horario_fim.slice(0, 5)}
                  </div>
                  {periodoDaTurma(turma) && <div>{periodoDaTurma(turma)}</div>}
```

- [ ] **Step 4: Página da turma (`turmas/[id]/page.tsx`)**

Troque `{nomesDosDias(turma.dias_semana)}` (linha ~30) pelo mesmo `textoDaRegra({...})` do passo anterior, e logo abaixo da linha de horário mostre `periodoDaTurma(turma)` quando houver. Ajuste os imports como no passo 3.

- [ ] **Step 5: Conferir e ver funcionando**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/turmas"`
Expected: sem erros.

Para ver a faixa sem esperar dezembro: no SQL editor, `update turmas set data_fim = current_date + 10 where id = <uma turma de teste com fim_automatico>`; abra `/turmas`, clique em "Estender até dez/AAAA"; confira `data_fim` = 31/12 do ano seguinte; desfaça o teste.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/turmas"
git commit -m "feat(turmas): mostra frequencia e periodo e estende turmas no fim do ano"
```

---

### Task 16: Exclusão da turma inteira

**Files:**
- Create: `src/dominio/turmas/exclusao.ts`
- Test: `src/dominio/turmas/exclusao.test.ts`
- Modify: `src/app/(app)/turmas/acoes.ts` (`consultarExclusaoTurma`, `excluirTurma`, `PreviaExclusaoTurma`)

- [ ] **Step 1: Testes**

```ts
import { describe, expect, it } from 'vitest'
import { avaliarExclusaoTurma, type HistoricoDaTurma } from './exclusao'

const vazio: HistoricoDaTurma = { matriculas: 0, presencas: 0, reposicoes: 0, cobrancas: 0, pagamentos: 0 }

describe('avaliarExclusaoTurma', () => {
  it('sem histórico pode excluir, mesmo com aulas geradas', () => {
    const r = avaliarExclusaoTurma(vazio)
    expect(r.podeExcluir).toBe(true)
    expect(r.motivo).toContain('Não tem como voltar atrás')
  })

  it('pagamento de professor bloqueia com a mensagem do financeiro', () => {
    const r = avaliarExclusaoTurma({ ...vazio, pagamentos: 1 })
    expect(r.podeExcluir).toBe(false)
    expect(r.motivo).toContain('pagamento de um professor')
  })

  it('qualquer matrícula, mesmo encerrada, bloqueia', () => {
    const r = avaliarExclusaoTurma({ ...vazio, matriculas: 2 })
    expect(r.podeExcluir).toBe(false)
    expect(r.motivo).toContain('2 matrículas')
    expect(r.motivo).toContain('Encerre a turma')
  })

  it('lista tudo o que segura a turma', () => {
    const r = avaliarExclusaoTurma({ ...vazio, presencas: 1, reposicoes: 1, cobrancas: 3 })
    expect(r.motivo).toContain('1 presença registrada')
    expect(r.motivo).toContain('1 reposição')
    expect(r.motivo).toContain('3 aulas cobradas')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/turmas/exclusao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `exclusao.ts`**

```ts
/**
 * Rodada 4 (spec 6.1): a turma inteira só pode ser excluída se nunca teve
 * aluno nem histórico. Aula gerada sem nada ligado a ela não conta — antes
 * contava, e na prática nenhuma turma podia ser excluída.
 */
export interface HistoricoDaTurma {
  /** Qualquer status, inclusive de reposição. */
  matriculas: number
  presencas: number
  /** Pendências com origem ou destino nas aulas da turma. */
  reposicoes: number
  /** Itens de cobrança das aulas da turma. */
  cobrancas: number
  /** Itens de pagamento de professor da turma. */
  pagamentos: number
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function avaliarExclusaoTurma(h: HistoricoDaTurma): { podeExcluir: boolean; motivo: string } {
  if (h.pagamentos > 0) {
    return {
      podeExcluir: false,
      motivo:
        'Esta turma já entrou no pagamento de um professor. Excluir apagaria histórico financeiro, ' +
        'então ela só pode ser encerrada.',
    }
  }

  const partes = [
    h.matriculas > 0 && plural(h.matriculas, 'matrícula', 'matrículas'),
    h.presencas > 0 && plural(h.presencas, 'presença registrada', 'presenças registradas'),
    h.reposicoes > 0 && plural(h.reposicoes, 'reposição', 'reposições'),
    h.cobrancas > 0 && plural(h.cobrancas, 'aula cobrada', 'aulas cobradas'),
  ].filter((p): p is string => Boolean(p))

  if (partes.length > 0) {
    return {
      podeExcluir: false,
      motivo:
        `Esta turma tem ${partes.join(', ')}. Encerre a turma em vez de excluir: o evento sai da ` +
        'agenda do professor e o histórico continua de pé.',
    }
  }

  return {
    podeExcluir: true,
    motivo:
      'Esta turma nunca teve aluno nem histórico. Excluir apaga o cadastro e as aulas geradas e ' +
      'retira o evento da agenda do professor. Não tem como voltar atrás.',
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/turmas/exclusao.test.ts`
Expected: PASS.

- [ ] **Step 5: Ligar nas ações (`turmas/acoes.ts`)**

Troque `PreviaExclusaoTurma` e `consultarExclusaoTurma` por:

```ts
export interface PreviaExclusaoTurma {
  podeExcluir: boolean
  motivo: string
}

/**
 * O que acontece se esta turma for excluida — consultado ANTES de perguntar.
 * A regra mora em `dominio/turmas/exclusao.ts` (spec 6.1).
 */
export async function consultarExclusaoTurma(id: number): Promise<PreviaExclusaoTurma> {
  await exigirGestora()
  const supabase = await clienteServidor()
  const contar = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0
  const cabeca = { count: 'exact' as const, head: true }

  const [matriculas, presencas, comoOrigem, comoDestino, cobrancas, pagamentos] = await Promise.all([
    contar(supabase.from('matriculas').select('id', cabeca).eq('turma_id', id)),
    contar(supabase.from('presencas').select('id, aula:aulas!inner (turma_id)', cabeca).eq('aula.turma_id', id)),
    contar(
      supabase
        .from('pendencias_reposicao')
        .select('id, aula:aulas!aula_origem_id!inner (turma_id)', cabeca)
        .eq('aula.turma_id', id),
    ),
    contar(
      supabase
        .from('pendencias_reposicao')
        .select('id, aula:aulas!aula_reposicao_id!inner (turma_id)', cabeca)
        .eq('aula.turma_id', id),
    ),
    contar(supabase.from('itens_cobranca').select('id, aula:aulas!inner (turma_id)', cabeca).eq('aula.turma_id', id)),
    contar(supabase.from('itens_conta_pagar_professor').select('id', cabeca).eq('turma_id', id)),
  ])

  return avaliarExclusaoTurma({
    matriculas,
    presencas,
    reposicoes: comoOrigem + comoDestino,
    cobrancas,
    pagamentos,
  })
}
```

(import `avaliarExclusaoTurma` de `@/dominio/turmas/exclusao`.)

Em `excluirTurma`, entre o `apagarEventoDaTurma` e o delete da turma:

```ts
  // As aulas geradas seguram a turma (on delete restrict). Sem histórico, não
  // há o que preservar nelas; os links de presença saem em cascata.
  const { error: erroAulas } = await supabase.from('aulas').delete().eq('turma_id', id)
  if (erroAulas) return { ok: false, erro: erroAulas.message }
```

(mova o `const supabase = await clienteServidor()` para antes desse trecho.)

- [ ] **Step 6: Conferir e ver funcionando**

Run: `npx tsc --noEmit`
Expected: sem erros. `ExcluirTurma.tsx` só usa `podeExcluir` e `motivo`; não precisa mudar.

No app: crie uma turma recorrente sem aluno, abra a agenda (gera aulas), volte à turma e exclua → deve deixar. Numa turma com matrícula → bloqueia com a mensagem.

- [ ] **Step 7: Commit**

```bash
git add src/dominio/turmas/exclusao.ts src/dominio/turmas/exclusao.test.ts "src/app/(app)/turmas/acoes.ts"
git commit -m "feat(turmas): exclui turma sem historico mesmo com aulas geradas"
```

---

### Task 17: Cobrança da aula excluída e textos da origem `Exclusão`

**Files:**
- Modify: `src/dominio/cobrancas/geracao.ts`, `src/dados/reposicoes.ts:306`, `src/app/(app)/reposicoes/page.tsx:70`
- Test: `src/dominio/cobrancas/geracao.test.ts`

- [ ] **Step 1: Testes** (no fim de `geracao.test.ts`)

```ts
// Rodada 4 (spec 3.3): a aula excluída continua sendo a que o aluno pagou; a
// reposição dela entra com zero, como qualquer reposição.
describe('aula excluída', () => {
  it('é cobrada de quem foi transferido para reposição', () => {
    const [c] = montarCobrancas([
      { ...base, status_aula: 'Excluída', ausencia: { origem: 'Exclusão', cobrar: null } },
    ])
    expect(c.itens).toHaveLength(1)
    expect(c.itens[0].descricao).toContain('aula excluída, com reposição')
  })

  it('não é cobrada sem pendência de exclusão', () => {
    expect(montarCobrancas([{ ...base, status_aula: 'Excluída' }])).toEqual([])
  })

  it('não é cobrada se a gestora decidiu não cobrar', () => {
    expect(
      montarCobrancas([
        { ...base, status_aula: 'Excluída', ausencia: { origem: 'Exclusão', cobrar: false } },
      ]),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/cobrancas/geracao.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar em `geracao.ts`**

`status_aula` passa a `StatusAula` (`import type { OrigemAusencia, StatusAula } from '@/dominio/tipos'`). Em `faturavel`, troque a última condição por:

```ts
    (aula.status_aula === 'Agendada' ||
      aula.status_aula === 'Realizada' ||
      // Rodada 4: a aula excluída segue cobrada de quem foi para reposição —
      // é o que faz a reposição entrar com zero (spec 3.3).
      (aula.status_aula === 'Excluída' && aula.ausencia?.origem === 'Exclusão'))
```

Em `valorEDescricao`, troque o `if (a.ausencia) { … }` por:

```ts
  if (a.ausencia?.origem === 'Exclusão') {
    return { valor: a.valor, descricao: `${a.descricao} (aula excluída, com reposição)` }
  }
  if (a.ausencia) {
    const motivo = a.ausencia.origem === 'Aviso' ? 'avisou que não vem' : 'faltou'
    return { valor: a.valor, descricao: `${a.descricao} (não participou: ${motivo})` }
  }
```

- [ ] **Step 4: Textos da origem nas outras telas**

`src/dados/reposicoes.ts` (linha ~306) — troque a linha do `motivo` por:

```ts
  const motivo = { Aviso: 'avisou que não viria', Falta: 'faltou', Exclusão: 'teve a aula excluída' }[p.origem as OrigemAusencia]
```

`src/app/(app)/reposicoes/page.tsx` (linha ~70) — troque `{p.origem === 'Aviso' ? 'Avisou que não vinha a' : 'Faltou em'}` por:

```tsx
                      {{ Aviso: 'Avisou que não vinha a', Falta: 'Faltou em', Exclusão: 'Aula excluída de' }[p.origem]}
```

(Se `p.origem` não estiver tipado como `OrigemAusencia` ali, ajuste o tipo da consulta em `src/dados/reposicoes.ts:18`, já trocado na Task 2.)

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run src/dominio/cobrancas && npx tsc --noEmit`
Expected: PASS e sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/cobrancas src/dados/reposicoes.ts "src/app/(app)/reposicoes/page.tsx"
git commit -m "feat(cobrancas): aula excluida segue cobrada de quem foi para reposicao"
```

---

### Task 18: Exclusão de uma aula (domínio puro)

**Files:**
- Create: `src/dominio/agenda/exclusao-aula.ts`
- Test: `src/dominio/agenda/exclusao-aula.test.ts`

- [ ] **Step 1: Testes**

```ts
import { describe, expect, it } from 'vitest'
import { avaliarExclusaoAula, validarEscolhas, type SituacaoDaAula } from './exclusao-aula'

const situacao = (over: Partial<SituacaoDaAula> = {}): SituacaoDaAula => ({
  status: 'Agendada',
  temPresenca: false,
  regulares: [],
  reposicoes: [],
  comPendencia: [],
  ...over,
})

describe('avaliarExclusaoAula', () => {
  it('aula com presença não sai: ela aconteceu', () => {
    const r = avaliarExclusaoAula(situacao({ temPresenca: true }))
    expect(r.tipo).toBe('bloqueada')
  })

  it('aula realizada ou já excluída não sai', () => {
    expect(avaliarExclusaoAula(situacao({ status: 'Realizada' })).tipo).toBe('bloqueada')
    expect(avaliarExclusaoAula(situacao({ status: 'Excluída' })).tipo).toBe('bloqueada')
  })

  it('sem ninguém, basta confirmar', () => {
    expect(avaliarExclusaoAula(situacao())).toEqual({ tipo: 'sem-alunos' })
  })

  it('com alunos, lista quem precisa ir para reposição', () => {
    const r = avaliarExclusaoAula(
      situacao({
        regulares: [
          { aluno_id: 1, nome: 'Ana' },
          { aluno_id: 2, nome: 'Bia' }, // já avisou: tem pendência
          { aluno_id: 3, nome: 'Caio' }, // está repondo aqui
        ],
        reposicoes: [{ aluno_id: 3, nome: 'Caio', pendencia_id: 30 }],
        comPendencia: [2],
      }),
    )
    expect(r).toEqual({
      tipo: 'com-alunos',
      regulares: [{ aluno_id: 1, nome: 'Ana' }],
      reposicoes: [{ aluno_id: 3, nome: 'Caio', pendencia_id: 30 }],
    })
  })

  it('só quem já avisou: sem alunos a transferir', () => {
    expect(
      avaliarExclusaoAula(situacao({ regulares: [{ aluno_id: 2, nome: 'Bia' }], comPendencia: [2] })),
    ).toEqual({ tipo: 'sem-alunos' })
  })
})

describe('validarEscolhas', () => {
  const av = {
    tipo: 'com-alunos' as const,
    regulares: [{ aluno_id: 1, nome: 'Ana' }],
    reposicoes: [{ aluno_id: 3, nome: 'Caio', pendencia_id: 30 }],
  }

  it('aceita destino ou "deixar pendente" para cada aluno', () => {
    expect(
      validarEscolhas(av, 99, [{ aluno_id: 1, aula_destino_id: 50 }], [{ pendencia_id: 30, aula_destino_id: null }]),
    ).toEqual([])
  })

  it('exige uma escolha para cada aluno', () => {
    expect(validarEscolhas(av, 99, [], [{ pendencia_id: 30, aula_destino_id: null }])).toEqual([
      'Escolha o que fazer com Ana.',
    ])
  })

  it('não deixa repor na própria aula que está sendo excluída', () => {
    expect(
      validarEscolhas(av, 99, [{ aluno_id: 1, aula_destino_id: 99 }], [{ pendencia_id: 30, aula_destino_id: null }]),
    ).toEqual(['A reposição de Ana não pode ser na aula que está sendo excluída.'])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/dominio/agenda/exclusao-aula.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { StatusAula } from '@/dominio/tipos'

/**
 * Rodada 4 (spec 6.2): excluir uma aula de uma turma.
 *
 * Aula que aconteceu (presença registrada) não sai. Sem alunos, basta
 * confirmar. Com alunos, cada um vai para reposição antes — pelas regras de
 * reposição de sempre, sem cobrança.
 */
export interface AlunoNaAula {
  aluno_id: number
  nome: string
}

export interface SituacaoDaAula {
  status: StatusAula
  temPresenca: boolean
  /** Matrícula regular ativa cobrindo a data da aula. */
  regulares: AlunoNaAula[]
  /** Pendências Agendadas cujo destino é esta aula. */
  reposicoes: (AlunoNaAula & { pendencia_id: number })[]
  /** Alunos que já têm pendência com origem nesta aula (avisaram que não vinham). */
  comPendencia: number[]
}

export type AvaliacaoExclusaoAula =
  | { tipo: 'bloqueada'; motivo: string }
  | { tipo: 'sem-alunos' }
  | {
      tipo: 'com-alunos'
      regulares: AlunoNaAula[]
      reposicoes: (AlunoNaAula & { pendencia_id: number })[]
    }

export function avaliarExclusaoAula(s: SituacaoDaAula): AvaliacaoExclusaoAula {
  if (s.status === 'Excluída') return { tipo: 'bloqueada', motivo: 'Esta aula já foi excluída.' }
  if (s.status === 'Realizada' || s.temPresenca) {
    return {
      tipo: 'bloqueada',
      motivo: 'Esta aula já aconteceu: o professor registrou a presença. Ela não pode ser excluída.',
    }
  }

  // Quem repõe aqui é tratado pela pendência dele; quem já avisou já tem a
  // sua. Nenhum dos dois ganha uma segunda.
  const repondo = new Set(s.reposicoes.map((r) => r.aluno_id))
  const jaTem = new Set(s.comPendencia)
  const regulares = s.regulares.filter((a) => !repondo.has(a.aluno_id) && !jaTem.has(a.aluno_id))

  if (regulares.length === 0 && s.reposicoes.length === 0) return { tipo: 'sem-alunos' }
  return { tipo: 'com-alunos', regulares, reposicoes: s.reposicoes }
}

/** `aula_destino_id` nulo = deixar a reposição pendente. */
export interface EscolhaRegular {
  aluno_id: number
  aula_destino_id: number | null
}
export interface EscolhaReposicao {
  pendencia_id: number
  aula_destino_id: number | null
}

export function validarEscolhas(
  av: Extract<AvaliacaoExclusaoAula, { tipo: 'com-alunos' }>,
  aulaId: number,
  regulares: EscolhaRegular[],
  reposicoes: EscolhaReposicao[],
): string[] {
  const erros: string[] = []

  const conferir = (nome: string, escolha: { aula_destino_id: number | null } | undefined) => {
    if (!escolha) erros.push(`Escolha o que fazer com ${nome}.`)
    else if (escolha.aula_destino_id === aulaId) {
      erros.push(`A reposição de ${nome} não pode ser na aula que está sendo excluída.`)
    }
  }

  for (const a of av.regulares) conferir(a.nome, regulares.find((e) => e.aluno_id === a.aluno_id))
  for (const r of av.reposicoes) conferir(r.nome, reposicoes.find((e) => e.pendencia_id === r.pendencia_id))

  return erros
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/dominio/agenda/exclusao-aula.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/exclusao-aula.ts src/dominio/agenda/exclusao-aula.test.ts
git commit -m "feat(agenda): regras da exclusao de uma aula"
```

---

### Task 19: Exclusão de uma aula — banco e dados

**Files:**
- Create: `supabase/migrations/20261010000200_excluir_aula.sql`
- Create: `src/dados/exclusao-aula.ts`
- Modify: `src/app/(app)/agenda/acoes.ts`

- [ ] **Step 1: Migration da função**

```sql
-- Rodada 4 (spec 6.2): exclui uma aula e transfere os alunos para reposicao,
-- tudo numa transacao. O plano (quem vai para onde, quem precisa de matricula
-- de reposicao) e montado na aplicacao, pelas regras de `planejarReposicao`;
-- aqui so se aplica, conferindo de novo que a aula nao aconteceu.
--
-- p_novas: [{aluno_id, aula_destino_id|null, matricula_turma_id|null, matricula_data|null}]
-- p_devolvidas: [{pendencia_id, aula_destino_id|null, matricula_turma_id|null, matricula_data|null}]

create or replace function public.excluir_aula(
  p_aula_id bigint,
  p_novas jsonb,
  p_devolvidas jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.status_aula;
  v_item jsonb;
  v_pendencia bigint;
  v_antiga bigint;
  v_matricula bigint;
begin
  if not public.e_gestora() then
    raise exception 'Só a gestora pode excluir aulas.';
  end if;

  select status into v_status from aulas where id = p_aula_id for update;
  if not found then
    raise exception 'Esta aula não existe mais.';
  end if;
  if v_status in ('Realizada', 'Excluída')
     or exists (select 1 from presencas where aula_id = p_aula_id) then
    raise exception 'Esta aula já aconteceu ou já foi excluída.';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_novas, '[]'::jsonb)) loop
    v_matricula := null;
    if v_item->>'matricula_turma_id' is not null then
      insert into matriculas (aluno_id, turma_id, data_inicio, data_fim, flag_reposicao)
      values ((v_item->>'aluno_id')::bigint, (v_item->>'matricula_turma_id')::bigint,
              (v_item->>'matricula_data')::date, (v_item->>'matricula_data')::date, true)
      returning id into v_matricula;
    end if;

    insert into pendencias_reposicao
      (aluno_id, aula_origem_id, origem, status, aula_reposicao_id, matricula_reposicao_id)
    values (
      (v_item->>'aluno_id')::bigint,
      p_aula_id,
      'Exclusão',
      (case when v_item->>'aula_destino_id' is null then 'Pendente' else 'Agendada' end)::status_reposicao,
      (v_item->>'aula_destino_id')::bigint,
      v_matricula
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_devolvidas, '[]'::jsonb)) loop
    v_pendencia := (v_item->>'pendencia_id')::bigint;

    select matricula_reposicao_id into v_antiga
      from pendencias_reposicao
     where id = v_pendencia and aula_reposicao_id = p_aula_id and status = 'Agendada'
       for update;
    if not found then
      raise exception 'Uma reposição desta aula mudou enquanto a exclusão era preparada. Abra a aula de novo.';
    end if;

    v_matricula := null;
    if v_item->>'matricula_turma_id' is not null then
      insert into matriculas (aluno_id, turma_id, data_inicio, data_fim, flag_reposicao)
      select aluno_id, (v_item->>'matricula_turma_id')::bigint,
             (v_item->>'matricula_data')::date, (v_item->>'matricula_data')::date, true
        from pendencias_reposicao where id = v_pendencia
      returning id into v_matricula;
    end if;

    update pendencias_reposicao
       set status = (case when v_item->>'aula_destino_id' is null then 'Pendente' else 'Agendada' end)::status_reposicao,
           aula_reposicao_id = (v_item->>'aula_destino_id')::bigint,
           matricula_reposicao_id = v_matricula
     where id = v_pendencia;

    -- A matricula de reposicao era so para a aula que saiu (mesmo tratamento
    -- de desistirReposicao).
    if v_antiga is not null then
      delete from matriculas where id = v_antiga;
    end if;
  end loop;

  update aulas set status = 'Excluída' where id = p_aula_id;
end;
$$;

grant execute on function public.excluir_aula(bigint, jsonb, jsonb) to authenticated;
```

Run: `npx supabase db push < /dev/null`
Expected: `Applying migration 20261010000200_excluir_aula.sql...` e `Finished supabase db push.`

- [ ] **Step 2: `src/dados/exclusao-aula.ts`**

```ts
import 'server-only'
import { clienteServidor } from './cliente'
import { aulasDisponiveis } from './reposicoes'
import {
  avaliarExclusaoAula,
  validarEscolhas,
  type AvaliacaoExclusaoAula,
  type EscolhaRegular,
  type EscolhaReposicao,
} from '@/dominio/agenda/exclusao-aula'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import { planejarReposicao } from '@/dominio/reposicoes/agendamento'

const dia = (v: unknown) => String(v).slice(0, 10)

export interface PreviaExclusaoAula {
  turmaId: number
  avaliacao: AvaliacaoExclusaoAula
  /** Aulas futuras agendadas para a reposição, já sem esta. */
  destinos: { id: number; rotulo: string }[]
}

/** Spec 6.2: consultado antes de perguntar. */
export async function previaExclusaoAula(aulaId: number): Promise<PreviaExclusaoAula | null> {
  const supabase = await clienteServidor()
  const { data: aula } = await supabase
    .from('aulas')
    .select('id, turma_id, status, data_hora_inicio')
    .eq('id', aulaId)
    .maybeSingle()
  if (!aula) return null

  const data = dia(aula.data_hora_inicio)
  const [presencas, matriculas, repondo, avisos] = await Promise.all([
    supabase.from('presencas').select('id', { count: 'exact', head: true }).eq('aula_id', aulaId),
    supabase
      .from('matriculas')
      .select('aluno_id, data_fim, aluno:alunos!aluno_id (nome)')
      .eq('turma_id', aula.turma_id)
      .eq('status', 'Ativa')
      .eq('flag_reposicao', false)
      .lte('data_inicio', data),
    supabase
      .from('pendencias_reposicao')
      .select('id, aluno_id, aluno:alunos!aluno_id (nome)')
      .eq('aula_reposicao_id', aulaId)
      .eq('status', 'Agendada'),
    supabase.from('pendencias_reposicao').select('aluno_id').eq('aula_origem_id', aulaId),
  ])

  const nome = (a: unknown) => (a as { nome: string } | null)?.nome ?? 'Aluno'

  const avaliacao = avaliarExclusaoAula({
    status: aula.status,
    temPresenca: (presencas.count ?? 0) > 0,
    regulares: (matriculas.data ?? [])
      .filter((m) => !m.data_fim || dia(m.data_fim) >= data)
      .map((m) => ({ aluno_id: m.aluno_id, nome: nome(m.aluno) })),
    reposicoes: (repondo.data ?? []).map((p) => ({
      aluno_id: p.aluno_id,
      nome: nome(p.aluno),
      pendencia_id: p.id,
    })),
    comPendencia: (avisos.data ?? []).map((p) => p.aluno_id),
  })

  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const destinos =
    avaliacao.tipo === 'com-alunos'
      ? (await aulasDisponiveis(hoje))
          .filter((a) => a.id !== aulaId)
          .map((a) => ({
            id: a.id,
            rotulo: `${dia(a.data_hora_inicio).split('-').reverse().join('/')} ${String(a.data_hora_inicio).slice(11, 16)} — ${a.turma?.nome ?? 'Turma'}`,
          }))
      : []

  return { turmaId: aula.turma_id, avaliacao, destinos }
}

/**
 * Monta o plano de cada aluno (precisa de matrícula de reposição?) pelas
 * regras de `planejarReposicao` e aplica tudo numa transação no banco.
 */
export async function executarExclusaoAula(
  aulaId: number,
  regulares: EscolhaRegular[],
  reposicoes: EscolhaReposicao[],
): Promise<{ ok: true; turmaId: number } | { ok: false; erros: string[] }> {
  const previa = await previaExclusaoAula(aulaId)
  if (!previa) return { ok: false, erros: ['Esta aula não existe mais.'] }

  const { avaliacao } = previa
  if (avaliacao.tipo === 'bloqueada') return { ok: false, erros: [avaliacao.motivo] }

  if (avaliacao.tipo === 'com-alunos') {
    const erros = validarEscolhas(avaliacao, aulaId, regulares, reposicoes)
    if (erros.length > 0) return { ok: false, erros }
  }

  const supabase = await clienteServidor()
  const destinoIds = [...regulares, ...reposicoes]
    .map((e) => e.aula_destino_id)
    .filter((id): id is number => id !== null)

  // `.in` com lista vazia não traz nada, sem erro: não precisa de atalho.
  const [{ data: destinos }, { data: pendencias }] = await Promise.all([
    supabase.from('aulas').select('id, turma_id, status, data_hora_inicio').in('id', destinoIds),
    supabase
      .from('pendencias_reposicao')
      .select('id, aluno_id, aula_origem_id, status, aula_origem:aulas!aula_origem_id (turma_id)')
      .in('id', reposicoes.map((r) => r.pendencia_id)),
  ])

  const destinoPorId = new Map((destinos ?? []).map((d) => [d.id, d]))
  const erros: string[] = []

  async function planoDe(
    pendencia: { id: number; aluno_id: number; aula_origem_id: number; turma_origem_id: number },
    destinoId: number | null,
  ) {
    if (destinoId === null) return { aula_destino_id: null, matricula_turma_id: null, matricula_data: null }
    const destino = destinoPorId.get(destinoId)
    if (!destino) {
      erros.push('Uma das aulas escolhidas para reposição não existe mais.')
      return null
    }
    const { data: mats } = await supabase
      .from('matriculas')
      .select('aluno_id, turma_id')
      .eq('aluno_id', pendencia.aluno_id)
      .eq('status', 'Ativa')
    const plano = planejarReposicao({ ...pendencia, status: 'Pendente' }, destino, mats ?? [])
    erros.push(...plano.erros)
    return {
      aula_destino_id: destinoId,
      matricula_turma_id: plano.precisaMatricula ? destino.turma_id : null,
      matricula_data: plano.precisaMatricula ? dia(destino.data_hora_inicio) : null,
    }
  }

  const novas = []
  if (avaliacao.tipo === 'com-alunos') {
    for (const a of avaliacao.regulares) {
      const escolha = regulares.find((e) => e.aluno_id === a.aluno_id)!
      const plano = await planoDe(
        { id: 0, aluno_id: a.aluno_id, aula_origem_id: aulaId, turma_origem_id: previa.turmaId },
        escolha.aula_destino_id,
      )
      if (plano) novas.push({ aluno_id: a.aluno_id, ...plano })
    }
  }

  const devolvidas = []
  for (const r of reposicoes) {
    const p = (pendencias ?? []).find((x) => x.id === r.pendencia_id)
    if (!p) {
      erros.push('Uma reposição desta aula não existe mais. Abra a aula de novo.')
      continue
    }
    const origem = p.aula_origem as unknown as { turma_id: number } | null
    const plano = await planoDe(
      { id: p.id, aluno_id: p.aluno_id, aula_origem_id: p.aula_origem_id, turma_origem_id: origem?.turma_id ?? 0 },
      r.aula_destino_id,
    )
    if (plano) devolvidas.push({ pendencia_id: p.id, ...plano })
  }

  if (erros.length > 0) return { ok: false, erros: [...new Set(erros)] }

  const { error } = await supabase.rpc('excluir_aula', {
    p_aula_id: aulaId,
    p_novas: novas,
    p_devolvidas: devolvidas,
  })
  if (error) return { ok: false, erros: [error.message] }

  return { ok: true, turmaId: previa.turmaId }
}
```

Observação para quem implementa: `planejarReposicao` recebe `destino` com `{ id, turma_id, status }` — confira a assinatura em `src/dominio/reposicoes/agendamento.ts` e passe só esses campos se o TypeScript reclamar do `data_hora_inicio`.

- [ ] **Step 3: Ações em `src/app/(app)/agenda/acoes.ts`**

```ts
import { after } from 'next/server'
import { executarExclusaoAula, previaExclusaoAula, type PreviaExclusaoAula } from '@/dados/exclusao-aula'
import { sincronizarEventoDaTurma } from '@/dados/evento-da-turma'
import type { EscolhaRegular, EscolhaReposicao } from '@/dominio/agenda/exclusao-aula'

export async function consultarExclusaoAula(aulaId: number): Promise<PreviaExclusaoAula | null> {
  await exigirGestora()
  return previaExclusaoAula(aulaId)
}

export async function excluirAula(
  aulaId: number,
  regulares: EscolhaRegular[],
  reposicoes: EscolhaReposicao[],
): Promise<{ ok: boolean; erros?: string[] }> {
  await exigirGestora()
  const r = await executarExclusaoAula(aulaId, regulares, reposicoes)
  if (!r.ok) return r

  // A data vira exceção no evento do Google.
  after(async () => {
    try {
      const s = await sincronizarEventoDaTurma(r.turmaId)
      if (!s.ok) console.warn('evento nao atualizado apos excluir aula:', s.motivo)
    } catch (e) {
      console.error('falha ao atualizar o evento apos excluir aula:', e)
    }
  })

  revalidatePath('/agenda')
  revalidatePath('/reposicoes')
  return { ok: true }
}
```

Junte aos imports existentes do arquivo (`exigirGestora`, `revalidatePath` provavelmente já estão lá; confira).

- [ ] **Step 4: Conferir**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261010000200_excluir_aula.sql src/dados/exclusao-aula.ts "src/app/(app)/agenda/acoes.ts"
git commit -m "feat(agenda): exclusao de aula com transferencia para reposicao numa transacao"
```

---

### Task 20: Janela "Excluir esta aula"

**Files:**
- Create: `src/app/(app)/agenda/aulas/[id]/ExcluirAula.tsx`
- Modify: `src/app/(app)/agenda/aulas/[id]/page.tsx`

- [ ] **Step 1: Componente**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { consultarExclusaoAula, excluirAula } from '../../acoes'
import type { PreviaExclusaoAula } from '@/dados/exclusao-aula'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'

/**
 * Rodada 4 (spec 6.2), no mesmo desenho de ExcluirTurma: consulta primeiro,
 * mostra o que vai acontecer e só então pergunta. Com alunos, cada um escolhe
 * a aula de reposição ali mesmo — ou fica pendente.
 */
export function ExcluirAula({ aulaId, quando }: { aulaId: number; quando: string }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [previa, setPrevia] = useState<PreviaExclusaoAula | null>(null)
  const [destinos, setDestinos] = useState<Record<string, number | null>>({})
  const [erros, setErros] = useState<string[]>([])
  const [pendente, iniciar] = useTransition()

  function abrir() {
    setErros([])
    iniciar(async () => {
      const p = await consultarExclusaoAula(aulaId)
      setPrevia(p)
      setDestinos({})
      setAberto(true)
    })
  }

  function confirmar() {
    if (!previa || previa.avaliacao.tipo === 'bloqueada') return
    const av = previa.avaliacao
    const regulares =
      av.tipo === 'com-alunos'
        ? av.regulares.map((a) => ({ aluno_id: a.aluno_id, aula_destino_id: destinos[`a${a.aluno_id}`] ?? null }))
        : []
    const reposicoes =
      av.tipo === 'com-alunos'
        ? av.reposicoes.map((r) => ({ pendencia_id: r.pendencia_id, aula_destino_id: destinos[`p${r.pendencia_id}`] ?? null }))
        : []

    iniciar(async () => {
      const r = await excluirAula(aulaId, regulares, reposicoes)
      if (r.ok) {
        setAberto(false)
        router.push('/agenda')
        router.refresh()
      } else {
        setErros(r.erros ?? ['Não foi possível excluir a aula.'])
      }
    })
  }

  const av = previa?.avaliacao
  const seletor = (chave: string, nome: string) => (
    <label key={chave} className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{nome}</span>
      <select
        className={entradaClasse}
        value={destinos[chave] ?? ''}
        onChange={(e) =>
          setDestinos((d) => ({ ...d, [chave]: e.target.value ? Number(e.target.value) : null }))
        }
      >
        <option value="">Deixar a reposição pendente</option>
        {previa?.destinos.map((d) => (
          <option key={d.id} value={d.id}>
            {d.rotulo}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <>
      <Botao aparencia="perigo" type="button" disabled={pendente} onClick={abrir}>
        {pendente && !aberto ? 'Verificando…' : 'Excluir esta aula'}
      </Botao>

      <AnimatePresence>
        {aberto && av && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-tinta/30"
              onClick={() => setAberto(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-exclusao-aula"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-painel border border-borda bg-superficie p-6 shadow-elevado"
            >
              <h2 id="titulo-exclusao-aula" className="text-xl">
                {av.tipo === 'bloqueada' ? 'Esta aula não pode ser excluída' : `Excluir a aula de ${quando}?`}
              </h2>

              {av.tipo === 'bloqueada' && <p className="mt-3 text-tinta-suave">{av.motivo}</p>}

              {av.tipo === 'sem-alunos' && (
                <p className="mt-3 text-tinta-suave">
                  Ninguém está matriculado nesta aula. Ela sai da agenda do sistema e da agenda do
                  professor no Google.
                </p>
              )}

              {av.tipo === 'com-alunos' && (
                <div className="mt-3 flex flex-col gap-4">
                  <p className="text-tinta-suave">
                    Antes de excluir, diga para onde vai cada aluno. A reposição não gera cobrança
                    nova; quem ficar pendente aparece em Reposições.
                  </p>
                  {av.regulares.map((a) => seletor(`a${a.aluno_id}`, a.nome))}
                  {av.reposicoes.length > 0 && (
                    <p className="text-sm text-tinta-suave">Estavam repondo nesta aula:</p>
                  )}
                  {av.reposicoes.map((r) => seletor(`p${r.pendencia_id}`, r.nome))}
                </div>
              )}

              {erros.length > 0 && (
                <ul role="alert" className="mt-3 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
                  {erros.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {av.tipo === 'bloqueada' ? (
                  <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                    Entendi
                  </Botao>
                ) : (
                  <>
                    <Botao aparencia="perigo" disabled={pendente} onClick={confirmar}>
                      {pendente ? 'Excluindo…' : 'Sim, excluir a aula'}
                    </Botao>
                    <Botao aparencia="secundario" onClick={() => setAberto(false)}>
                      Cancelar
                    </Botao>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
```

- [ ] **Step 2: Página da aula**

Em `src/app/(app)/agenda/aulas/[id]/page.tsx`, importe `import { ExcluirAula } from './ExcluirAula'` e, logo antes do `<Link href="/agenda" …>` final:

```tsx
      {ehGestora && aula.status !== 'Excluída' && aula.status !== 'Realizada' && (
        <ExcluirAula aulaId={aula.id} quando={quando} />
      )}
```

Troque também a condição do `LinkDeChamada` de `aula.status !== 'Cancelada'` para `aula.status !== 'Cancelada' && aula.status !== 'Excluída'`.

- [ ] **Step 3: Conferir e ver funcionando**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/agenda"`
Expected: sem erros.

No app (como gestora):
1. Aula futura de turma sem aluno → "Excluir esta aula" → confirma → some da agenda; no Google, a ocorrência some (EXDATE).
2. Aula com 2 alunos → janela lista os dois; escolha um destino para um e deixe o outro pendente → confirma → em `/reposicoes` aparecem as duas pendências ("Aula excluída de …"), uma Agendada e outra Pendente.
3. Aula com presença registrada → "Esta aula não pode ser excluída".
4. Abra a agenda de novo: a aula excluída não volta.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/agenda/aulas/[id]"
git commit -m "feat(agenda): botao para excluir uma aula com transferencia dos alunos"
```

---

### Task 21: Verificação final

- [ ] **Step 1: Testes, tipos, lint e build**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: todos passam. Se o build falhar por API do Next, leia o guia correspondente em `node_modules/next/dist/docs/` antes de corrigir.

- [ ] **Step 2: Conferir que nada mais lista aula excluída**

Run: `grep -rn "from('aulas')" src --include=*.ts --include=*.tsx`
Para cada consulta que lista aulas para a gestora/professor sem filtrar status (agenda, presença do professor, notificações), confirme que ela filtra `Agendada`/`Realizada` ou `neq('status', 'Excluída')`. `cobrancas.ts` (aulasDoMes) **não** filtra: a cobrança decide em `faturavel` (Task 17).

- [ ] **Step 3: Roteiro manual completo** (com `GOOGLE_CALENDAR_ATIVO=true` num professor de teste)

1. Turma quinzenal Ter/Qui, início retroativo há 3 semanas, sem fim → agenda mostra as aulas passadas e futuras, nenhuma em feriado; Google mostra a série até 31/12 com as exceções.
2. Cadastre um feriado numa terça futura dessa turma (sem aluno) → a aula some da agenda e do Google.
3. Matricule um aluno e cadastre outro feriado numa quinta futura → a aula fica e aparece no alerta de conflito.
4. Turma "Não se repete" em feriado → alerta; cria com confirmação.
5. Edite a turma de Ter/Qui para Seg/Qua → aulas futuras vazias de Ter/Qui somem; as novas aparecem.
6. Exclua uma aula com aluno, transferindo-o → pendência de origem "Exclusão"; gere a cobrança do mês → a aula excluída aparece como "(aula excluída, com reposição)" e a reposição com R$ 0,00.
7. Exclua a turma recém-criada sem aluno → excluída; tente na turma com matrícula → bloqueada.

- [ ] **Step 4: Commit final (se algo foi ajustado)**

```bash
git add -A
git commit -m "chore(turmas): ajustes da verificacao final"
```
