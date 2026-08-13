# Mesinha Redonda OS — Plano 2: Agenda, Presenças e Reposições

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materializar as aulas de cada turma, exibi-las em uma agenda, permitir que o professor registre presença por link público sem login, e controlar as reposições que as faltas geram.

**Architecture:** A sincronização de agenda vive atrás de uma interface `ProvedorAgenda` com duas implementações: `RecorrenciaLocal` (deriva as ocorrências dos `dias_semana` da turma, funciona hoje) e `GoogleCalendar` (OAuth, plugável quando houver credenciais). A materialização é idempotente por `google_calendar_event_id`, então trocar de provedor não duplica aula. O formulário de presença é a única rota pública do sistema: roda no servidor, valida um token de uso único e escreve com a service role key, fora do RLS.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript strict, Supabase Postgres remoto, Tailwind v4, Motion, Zod 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-13-mesinha-redonda-design.md` (§4.2, §5.2, §6)
**Plano anterior:** `docs/superpowers/plans/2026-08-13-fundacao-e-cadastros.md` — concluído

---

## Estado ao iniciar este plano

| Item | Situação |
|---|---|
| Banco | Supabase **remoto**, projeto `ixegxvjimyhlvkyarcyr`, 7 migrations aplicadas |
| Tabelas | cidades, escolas, anos_escolares, materias, servicos (+histórico), contas, feriados, professores (+histórico), responsaveis, alunos, turmas, matriculas, perfis |
| Domínio | `dinheiro`, `tipos`, `turmas/nome`, `turmas/regras`, `matriculas/regras` — 45 testes |
| Cadastros | motor declarativo + 10 rotas dinâmicas, todas verificadas |
| Turmas/Matrículas | telas próprias funcionando |
| Auth | gestora e professor, RLS verificado por papel |
| Dados | seed de demonstração aplicado (`node scripts/semear.mjs`) |

**Logins:** `gestora@mesinharedonda.app` e `professor@mesinharedonda.app`, senha `mesinha123`.

## Regras do ambiente — leia antes de escrever código

Cada uma destas custou um bug real no Plano 1.

| Regra | Detalhe |
|---|---|
| **Nunca `supabase db reset`** | O projeto é remoto e vinculado: `reset` apaga o banco. Use `npx supabase db push`, que é incremental. |
| **Token do CLI** | Exporte antes de qualquer comando: `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local \| cut -d= -f2- \| tr -d '\r')` |
| **Sem `db psql`** | Contra remoto não existe. Use `node scripts/consultar.mjs <tabela> [colunas]`. |
| **Fronteira Server → Client** | Um Server Component só passa **objetos simples** como prop. Instância de classe (schema Zod, `Date` complexo) quebra em **runtime** — build e `tsc` passam limpos. Foi assim que dez rotas foram para HTTP 500 sem ninguém ver. Veja `paraCliente()` em `src/cadastros/tipos.ts`. |
| **`middleware` é `proxy`** | Next 16. O arquivo é `proxy.ts` na raiz e exporta `proxy`. |
| **`params` é Promise** | Sempre `params: Promise<{...}>` com `await`. |
| **Tailwind v4** | Tokens do `@theme` viram utilitários: `rounded-cartao`, `shadow-cartao`, `font-titulo`. Nunca `rounded-[--radius-cartao]`. |
| **Zod 4** | `z.enum(arrayReadonly)`, `z.number({ message })`. `ZodRawShape` é readonly. |
| **CHECK com array** | `array_length(arr, 1)` devolve `NULL` para array vazio, e CHECK só bloqueia em `FALSE`. Use `cardinality(arr)`. |
| **Verificação vale com sessão** | 307 para `/login` só prova que a rota existe. Use `node scripts/verificar-e2e.mjs`. |
| **Shell** | Todo comando recebe `< /dev/null`. Caminhos com `(` `[` entre aspas no Git Bash. |
| **Servidor dev** | Pode haver um `next dev` na porta 3000 que você não iniciou. Não derrube; o Next 16 recusa um segundo. |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/agenda/materializacao.ts` | Recorrência da turma → ocorrências de aula |
| `src/dominio/agenda/feriados.ts` | Detecção de conflito aula × feriado |
| `src/dominio/presencas/registro.ts` | Presenças em lote e quais faltas geram pendência |
| `src/dominio/reposicoes/agendamento.ts` | Regras de agendamento e desistência |
| `src/agenda/provedor.ts` | Interface `ProvedorAgenda` |
| `src/agenda/recorrencia-local.ts` | Provedor sem dependência externa |
| `src/agenda/google-calendar.ts` | Provedor OAuth, desligado por env |
| `src/dados/aulas.ts` | Consultas e sincronização de aulas |
| `src/dados/presencas.ts` | Presenças e tokens |
| `src/dados/reposicoes.ts` | Pendências de reposição |
| `src/app/(app)/agenda/` | Calendário e detalhe da aula |
| `src/app/(app)/reposicoes/` | Painel de pendências |
| `src/app/p/presenca/[token]/` | **Rota pública**, sem login |
| `supabase/migrations/2026081400*.sql` | Aulas, presenças, pendências, tokens, notificações, logs |

---

### Task 1: Migration — aulas

**Files:**
- Create: `supabase/migrations/20260814000100_aulas.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- Cada ocorrencia de uma turma. Materializada a partir da recorrencia da turma
-- ou lida do Google Calendar; nunca criada a mao pela gestora, exceto ajuste
-- pontual de status (Modulos Operacionais 4.2).

create type public.status_aula as enum ('Agendada', 'Realizada', 'Cancelada', 'Feriado');

create table public.aulas (
  id bigint generated always as identity primary key,
  turma_id bigint not null references public.turmas (id) on delete restrict,
  google_calendar_event_id text not null unique,
  data_hora_inicio timestamptz not null,
  data_hora_fim timestamptz not null,
  status public.status_aula not null default 'Agendada',
  link_online text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint horario_coerente check (data_hora_fim > data_hora_inicio)
);

comment on column public.aulas.google_calendar_event_id is
  'Chave de idempotencia da sincronizacao. O provedor local usa o formato
   local:t<turma_id>:<ISO>. Trocar para o Google Calendar nao duplica aula
   porque o upsert e por esta coluna.';

create index on public.aulas (turma_id, data_hora_inicio);
create index on public.aulas (data_hora_inicio);
create index on public.aulas (status);

create trigger tocar_updated_at before update on public.aulas
  for each row execute function public.tocar_updated_at();

alter table public.aulas enable row level security;

create policy "gestora total" on public.aulas for all
  using (public.e_gestora()) with check (public.e_gestora());

create policy "professor le aulas de suas turmas" on public.aulas for select
  to authenticated using (
    exists (
      select 1 from public.turmas t
       where t.id = aulas.turma_id
         and t.professor_id = public.professor_do_usuario()
    )
  );
```

- [ ] **Step 2: Aplicar**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r')
npx supabase db push < /dev/null
```
Expected: `Applying migration 20260814000100_aulas.sql...` e `Finished supabase db push.`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814000100_aulas.sql
git commit -m "feat(banco): tabela de aulas com idempotencia por evento de agenda"
```

---

### Task 2: Migration — presenças, pendências e tokens

**Files:**
- Create: `supabase/migrations/20260814000200_presencas.sql`

- [ ] **Step 1: Escrever a migration**

```sql
create type public.status_reposicao as enum ('Pendente', 'Agendada', 'Realizada', 'Desistida');

create table public.presencas (
  id bigint generated always as identity primary key,
  aula_id bigint not null references public.aulas (id) on delete cascade,
  aluno_id bigint not null references public.alunos (id) on delete restrict,
  presente boolean not null,
  flag_reposicao boolean not null default false,
  registrado_por bigint references public.professores (id) on delete set null,
  registrado_em timestamptz not null default now(),
  observacao text,
  unique (aula_id, aluno_id)
);

comment on column public.presencas.flag_reposicao is
  'true quando esta presenca cumpre a reposicao de outra aula. Uma falta em
   aula de reposicao NAO gera nova pendencia (Operacionais 5.2).';

create index on public.presencas (aluno_id);
create index on public.presencas (aula_id);

create table public.pendencias_reposicao (
  id bigint generated always as identity primary key,
  aluno_id bigint not null references public.alunos (id) on delete restrict,
  aula_origem_id bigint not null references public.aulas (id) on delete cascade,
  status public.status_reposicao not null default 'Pendente',
  aula_reposicao_id bigint references public.aulas (id) on delete set null,
  matricula_reposicao_id bigint references public.matriculas (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma falta gera no maximo uma pendencia.
  unique (aluno_id, aula_origem_id)
);

create index on public.pendencias_reposicao (status);

create trigger tocar_updated_at before update on public.pendencias_reposicao
  for each row execute function public.tocar_updated_at();

-- Acesso publico ao formulario de presenca (Operacionais 5.5). O link e enviado
-- ao professor e nao exige login. O token e de uso unico: bloqueia apos
-- confirmado, e a gestora pode reabrir.
create table public.presenca_tokens (
  token text primary key,
  aula_id bigint not null references public.aulas (id) on delete cascade,
  professor_id bigint references public.professores (id) on delete set null,
  expira_em timestamptz not null,
  usado_em timestamptz,
  reaberto_em timestamptz,
  created_at timestamptz not null default now()
);

create index on public.presenca_tokens (aula_id);

alter table public.presencas enable row level security;
alter table public.pendencias_reposicao enable row level security;
alter table public.presenca_tokens enable row level security;

create policy "gestora total" on public.presencas for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "professor le presencas de suas turmas" on public.presencas for select
  to authenticated using (
    exists (
      select 1 from public.aulas a
        join public.turmas t on t.id = a.turma_id
       where a.id = presencas.aula_id
         and t.professor_id = public.professor_do_usuario()
    )
  );

create policy "gestora total" on public.pendencias_reposicao for all
  using (public.e_gestora()) with check (public.e_gestora());

-- Tokens sao lidos e escritos apenas pela service role, no servidor.
-- Nenhuma policy para authenticated ou anon: o RLS nega por padrao.
create policy "gestora total" on public.presenca_tokens for all
  using (public.e_gestora()) with check (public.e_gestora());
```

- [ ] **Step 2: Aplicar e verificar**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r')
npx supabase db push < /dev/null
node scripts/consultar.mjs presencas --count
node scripts/consultar.mjs pendencias_reposicao --count
node scripts/consultar.mjs presenca_tokens --count
```
Expected: push sem erro; as três tabelas respondem com `0 registro(s)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814000200_presencas.sql
git commit -m "feat(banco): presencas, pendencias de reposicao e tokens de acesso publico"
```

---

### Task 3: Migration — notificações e logs

**Files:**
- Create: `supabase/migrations/20260814000300_notificacoes_logs.sql`

- [ ] **Step 1: Escrever a migration**

```sql
create type public.tipo_notificacao as enum ('LinkAula', 'BoasVindas', 'Cobranca');
create type public.canal_envio as enum ('WhatsApp', 'E-mail');
create type public.status_notificacao as enum ('Pendente', 'Pronta', 'Enviada', 'Falhou');

-- Fila de mensagens. Nesta fase a gestora copia o texto gerado e envia pelo
-- WhatsApp; o status Enviada existe desde ja para que uma futura integracao
-- com a API apenas automatize a transicao, sem mudar o modelo de dados
-- (Operacionais 4.5 e 6.5).
create table public.notificacoes (
  id bigint generated always as identity primary key,
  tipo public.tipo_notificacao not null,
  canal public.canal_envio not null,
  destinatario_tipo text not null check (destinatario_tipo in ('aluno', 'responsavel')),
  destinatario_id bigint not null,
  agendado_para timestamptz,
  texto_gerado text,
  status public.status_notificacao not null default 'Pendente',
  enviado_em timestamptz,
  referencia_tipo text,
  referencia_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.notificacoes (status, agendado_para);

create trigger tocar_updated_at before update on public.notificacoes
  for each row execute function public.tocar_updated_at();

-- RNF de Logs: registrar geracao e confirmacao de cobrancas, baixas de
-- recebimento e de pagamento, com data/hora e usuario responsavel.
create table public.logs_operacionais (
  id bigint generated always as identity primary key,
  acao text not null,
  entidade text not null,
  entidade_id bigint,
  usuario text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);

create index on public.logs_operacionais (entidade, entidade_id);
create index on public.logs_operacionais (criado_em desc);

alter table public.notificacoes enable row level security;
alter table public.logs_operacionais enable row level security;

create policy "gestora total" on public.notificacoes for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "gestora le logs" on public.logs_operacionais for select
  using (public.e_gestora());
```

- [ ] **Step 2: Aplicar**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r')
npx supabase db push < /dev/null
node scripts/consultar.mjs notificacoes --count
```
Expected: push sem erro, `notificacoes: 0 registro(s)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814000300_notificacoes_logs.sql
git commit -m "feat(banco): fila de notificacoes e log operacional"
```

---

### Task 4: Materialização de ocorrências (TDD)

O coração da agenda. Dada a recorrência de uma turma e um intervalo, produz as ocorrências de aula. Puro, sem I/O — é o que permite testar a regra sem banco nem Google.

**Files:**
- Create: `src/dominio/agenda/materializacao.ts`
- Test: `src/dominio/agenda/materializacao.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/agenda/materializacao.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { idOcorrenciaLocal, materializar, type RecorrenciaTurma } from './materializacao'

const turma: RecorrenciaTurma = {
  id: 7,
  dias_semana: [2, 4], // terca e quinta
  horario_inicio: '15:00',
  horario_fim: '16:00',
  status: 'Ativa',
}

describe('materializar', () => {
  it('gera uma ocorrencia por dia da semana dentro do intervalo', () => {
    // 03/08/2026 e uma segunda-feira; a semana tem uma terca (04) e uma quinta (06).
    const oc = materializar(turma, '2026-08-03', '2026-08-09')
    expect(oc).toHaveLength(2)
    expect(oc[0].data).toBe('2026-08-04')
    expect(oc[1].data).toBe('2026-08-06')
  })

  it('cobre varias semanas', () => {
    const oc = materializar(turma, '2026-08-03', '2026-08-23')
    expect(oc).toHaveLength(6)
  })

  it('inclui as datas de fronteira do intervalo', () => {
    const oc = materializar(turma, '2026-08-04', '2026-08-06')
    expect(oc.map((o) => o.data)).toEqual(['2026-08-04', '2026-08-06'])
  })

  it('devolve os horarios da turma em cada ocorrencia', () => {
    const [primeira] = materializar(turma, '2026-08-03', '2026-08-09')
    expect(primeira.horario_inicio).toBe('15:00')
    expect(primeira.horario_fim).toBe('16:00')
  })

  it('nao gera nada para turma encerrada', () => {
    expect(materializar({ ...turma, status: 'Encerrada' }, '2026-08-03', '2026-08-23')).toEqual([])
  })

  it('nao gera nada quando a turma nao tem dia da semana', () => {
    expect(materializar({ ...turma, dias_semana: [] }, '2026-08-03', '2026-08-23')).toEqual([])
  })

  it('nao gera nada quando o intervalo e invertido', () => {
    expect(materializar(turma, '2026-08-23', '2026-08-03')).toEqual([])
  })

  it('atribui a cada ocorrencia um id estavel e unico', () => {
    const oc = materializar(turma, '2026-08-03', '2026-08-09')
    expect(oc[0].google_calendar_event_id).toBe('local:t7:2026-08-04T15:00')
    expect(new Set(oc.map((o) => o.google_calendar_event_id)).size).toBe(oc.length)
  })

  it('e deterministico: rodar duas vezes da o mesmo resultado', () => {
    // E o que garante que ressincronizar nao duplica aula.
    expect(materializar(turma, '2026-08-03', '2026-08-23')).toEqual(
      materializar(turma, '2026-08-03', '2026-08-23'),
    )
  })
})

describe('idOcorrenciaLocal', () => {
  it('monta o id no formato esperado', () => {
    expect(idOcorrenciaLocal(7, '2026-08-04', '15:00')).toBe('local:t7:2026-08-04T15:00')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- agenda/materializacao`
Expected: FAIL — `Failed to resolve import "./materializacao"`

- [ ] **Step 3: Implementar**

`src/dominio/agenda/materializacao.ts`:
```ts
import type { StatusTurma } from '@/dominio/tipos'

export interface RecorrenciaTurma {
  id: number
  /** Mesmo indice de Date.getDay(): 0 = domingo. */
  dias_semana: number[]
  horario_inicio: string
  horario_fim: string
  status: StatusTurma
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

/** Datas em ISO (AAAA-MM-DD) para evitar fuso horario na aritmetica de dias. */
function paraUTC(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia))
}

function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Expande a recorrencia da turma nas ocorrencias que caem no intervalo
 * [de, ate], inclusive nas duas pontas.
 *
 * Puro e deterministico de proposito: e a propriedade que garante que
 * ressincronizar a agenda nao cria aula duplicada.
 */
export function materializar(
  turma: RecorrenciaTurma,
  de: string,
  ate: string,
): OcorrenciaAula[] {
  if (turma.status !== 'Ativa') return []
  if (turma.dias_semana.length === 0) return []
  if (de > ate) return []

  const dias = new Set(turma.dias_semana)
  const ocorrencias: OcorrenciaAula[] = []
  const fim = paraUTC(ate)

  for (let d = paraUTC(de); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!dias.has(d.getUTCDay())) continue
    const data = paraISO(d)
    ocorrencias.push({
      data,
      horario_inicio: turma.horario_inicio,
      horario_fim: turma.horario_fim,
      google_calendar_event_id: idOcorrenciaLocal(turma.id, data, turma.horario_inicio),
    })
  }

  return ocorrencias
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- agenda/materializacao`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/
git commit -m "feat(dominio): materializacao deterministica de ocorrencias de aula"
```

---

### Task 5: Conflito com feriado (TDD)

Regra 4.2: o sistema **alerta** quando uma aula cai em feriado, para a gestora decidir. Nunca cancela sozinho.

**Files:**
- Create: `src/dominio/agenda/feriados.ts`
- Test: `src/dominio/agenda/feriados.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/agenda/feriados.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { conflitosComFeriado, type AulaParaConferir, type Feriado } from './feriados'

const feriados: Feriado[] = [
  { data: '2026-09-07', nome: 'Independência do Brasil' },
  { data: '2026-11-15', nome: 'Proclamação da República' },
]

const aulas: AulaParaConferir[] = [
  { id: 1, data: '2026-09-07', status: 'Agendada' },
  { id: 2, data: '2026-09-08', status: 'Agendada' },
  { id: 3, data: '2026-11-15', status: 'Agendada' },
]

describe('conflitosComFeriado', () => {
  it('encontra as aulas que caem em feriado', () => {
    const c = conflitosComFeriado(aulas, feriados)
    expect(c).toHaveLength(2)
    expect(c[0]).toEqual({ aulaId: 1, data: '2026-09-07', feriado: 'Independência do Brasil' })
  })

  it('ignora aula em dia sem feriado', () => {
    expect(conflitosComFeriado([aulas[1]], feriados)).toEqual([])
  })

  it('ignora aula ja cancelada ou ja marcada como feriado', () => {
    const resolvidas: AulaParaConferir[] = [
      { id: 4, data: '2026-09-07', status: 'Cancelada' },
      { id: 5, data: '2026-09-07', status: 'Feriado' },
    ]
    expect(conflitosComFeriado(resolvidas, feriados)).toEqual([])
  })

  it('ignora aula ja realizada, mesmo em feriado', () => {
    // Se a aula aconteceu, nao ha o que decidir.
    expect(conflitosComFeriado([{ id: 6, data: '2026-09-07', status: 'Realizada' }], feriados)).toEqual([])
  })

  it('nao decide nada sozinho: apenas relata', () => {
    const c = conflitosComFeriado(aulas, feriados)
    expect(c.every((x) => 'aulaId' in x && 'feriado' in x)).toBe(true)
  })

  it('lida com lista vazia dos dois lados', () => {
    expect(conflitosComFeriado([], feriados)).toEqual([])
    expect(conflitosComFeriado(aulas, [])).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- agenda/feriados`
Expected: FAIL — `Failed to resolve import "./feriados"`

- [ ] **Step 3: Implementar**

`src/dominio/agenda/feriados.ts`:
```ts
export interface Feriado {
  data: string
  nome: string
}

export interface AulaParaConferir {
  id: number
  /** Data em ISO, AAAA-MM-DD. */
  data: string
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
}

export interface ConflitoFeriado {
  aulaId: number
  data: string
  feriado: string
}

/**
 * Modulos Operacionais 4.2: o sistema alerta a gestora quando uma aula coincide
 * com feriado, para que ela cancele, remarque ou mantenha — o sistema nunca
 * decide isso sozinho. Por isso esta funcao apenas relata.
 *
 * Aulas ja resolvidas (Cancelada, Feriado) ou ja ocorridas (Realizada) nao
 * entram: nao ha decisao pendente sobre elas.
 */
export function conflitosComFeriado(
  aulas: AulaParaConferir[],
  feriados: Feriado[],
): ConflitoFeriado[] {
  const porData = new Map(feriados.map((f) => [f.data, f.nome]))

  return aulas
    .filter((a) => a.status === 'Agendada')
    .filter((a) => porData.has(a.data))
    .map((a) => ({ aulaId: a.id, data: a.data, feriado: porData.get(a.data)! }))
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- agenda/feriados`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/feriados.ts src/dominio/agenda/feriados.test.ts
git commit -m "feat(dominio): deteccao de conflito entre aula e feriado"
```

---

### Task 6: Registro de presença e geração de pendência (TDD)

A regra com maior consequência financeira deste plano: uma falta gera pendência de reposição, **exceto** se a própria aula já for uma reposição.

**Files:**
- Create: `src/dominio/presencas/registro.ts`
- Test: `src/dominio/presencas/registro.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/presencas/registro.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { montarRegistro, type MatriculadoNaAula, type RespostaChamada } from './registro'

const matriculados: MatriculadoNaAula[] = [
  { aluno_id: 1, nome: 'João Ribeiro', flag_reposicao: false },
  { aluno_id: 2, nome: 'Maria Ribeiro', flag_reposicao: false },
  { aluno_id: 3, nome: 'Pedro Tavares', flag_reposicao: true },
]

describe('montarRegistro', () => {
  it('cria uma presenca para cada aluno matriculado', () => {
    const respostas: RespostaChamada[] = [
      { aluno_id: 1, presente: true },
      { aluno_id: 2, presente: true },
      { aluno_id: 3, presente: true },
    ]
    const r = montarRegistro({ aulaId: 10, professorId: 5, matriculados, respostas })
    expect(r.presencas).toHaveLength(3)
    expect(r.presencas.every((p) => p.aula_id === 10 && p.registrado_por === 5)).toBe(true)
  })

  it('marca a aula como Realizada', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: true }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: true }],
    })
    expect(r.novoStatusAula).toBe('Realizada')
  })

  it('assume presente quando o professor nao respondeu por um aluno', () => {
    // O formulario tem Presente como padrao (Operacionais 5.5).
    const r = montarRegistro({ aulaId: 10, professorId: 5, matriculados, respostas: [] })
    expect(r.presencas.every((p) => p.presente)).toBe(true)
  })

  it('gera pendencia de reposicao para cada falta', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: false }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: true }],
    })
    expect(r.pendencias).toEqual([{ aluno_id: 1, aula_origem_id: 10 }])
  })

  it('NAO gera pendencia quando a falta e em aula de reposicao', () => {
    // Pedro (id 3) esta na turma por matricula de reposicao: faltar a reposicao
    // nao gera uma nova reposicao (Operacionais 5.2).
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: true }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: false }],
    })
    expect(r.pendencias).toEqual([])
  })

  it('marca flag_reposicao na presenca de quem esta ali por reposicao', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: true }, { aluno_id: 2, presente: true }, { aluno_id: 3, presente: true }],
    })
    expect(r.presencas.find((p) => p.aluno_id === 3)!.flag_reposicao).toBe(true)
    expect(r.presencas.find((p) => p.aluno_id === 1)!.flag_reposicao).toBe(false)
  })

  it('preserva a observacao por aluno', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: false, observacao: 'Avisou que estava doente' }],
    })
    expect(r.presencas.find((p) => p.aluno_id === 1)!.observacao).toBe('Avisou que estava doente')
  })

  it('lista as faltas para o aviso a gestora', () => {
    // Operacionais 5.2: a gestora e notificada a cada ausencia.
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 1, presente: false }, { aluno_id: 3, presente: false }],
    })
    expect(r.ausentes.map((a) => a.nome)).toEqual(['João Ribeiro', 'Pedro Tavares'])
  })

  it('ignora resposta de aluno que nao esta matriculado', () => {
    const r = montarRegistro({
      aulaId: 10, professorId: 5, matriculados,
      respostas: [{ aluno_id: 999, presente: false }],
    })
    expect(r.presencas.map((p) => p.aluno_id)).toEqual([1, 2, 3])
    expect(r.pendencias).toEqual([])
  })

  it('nao gera presenca quando ninguem esta matriculado', () => {
    const r = montarRegistro({ aulaId: 10, professorId: 5, matriculados: [], respostas: [] })
    expect(r.presencas).toEqual([])
    expect(r.novoStatusAula).toBe('Realizada')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- presencas/registro`
Expected: FAIL — `Failed to resolve import "./registro"`

- [ ] **Step 3: Implementar**

`src/dominio/presencas/registro.ts`:
```ts
export interface MatriculadoNaAula {
  aluno_id: number
  nome: string
  /** true quando o aluno esta na turma por matricula de reposicao. */
  flag_reposicao: boolean
}

export interface RespostaChamada {
  aluno_id: number
  presente: boolean
  observacao?: string
}

export interface PresencaAGravar {
  aula_id: number
  aluno_id: number
  presente: boolean
  flag_reposicao: boolean
  registrado_por: number | null
  observacao: string | null
}

export interface PendenciaAGerar {
  aluno_id: number
  aula_origem_id: number
}

export interface ResultadoChamada {
  presencas: PresencaAGravar[]
  pendencias: PendenciaAGerar[]
  ausentes: { aluno_id: number; nome: string }[]
  novoStatusAula: 'Realizada'
}

interface Entrada {
  aulaId: number
  professorId: number | null
  matriculados: MatriculadoNaAula[]
  respostas: RespostaChamada[]
}

/**
 * Modulos Operacionais 5.2. Ao salvar o formulario, o sistema gera uma presenca
 * para CADA aluno matriculado — nao apenas para os que o professor tocou. O
 * formulario tem "Presente" como padrao, entao a ausencia de resposta significa
 * presente.
 *
 * Cada falta gera uma pendencia de reposicao, salvo quando o aluno esta naquela
 * aula por matricula de reposicao: faltar a uma reposicao nao gera outra.
 */
export function montarRegistro({
  aulaId,
  professorId,
  matriculados,
  respostas,
}: Entrada): ResultadoChamada {
  const porAluno = new Map(respostas.map((r) => [r.aluno_id, r]))

  const presencas: PresencaAGravar[] = matriculados.map((m) => {
    const resposta = porAluno.get(m.aluno_id)
    return {
      aula_id: aulaId,
      aluno_id: m.aluno_id,
      presente: resposta?.presente ?? true,
      flag_reposicao: m.flag_reposicao,
      registrado_por: professorId,
      observacao: resposta?.observacao?.trim() || null,
    }
  })

  const faltaram = presencas.filter((p) => !p.presente)

  return {
    presencas,
    pendencias: faltaram
      .filter((p) => !p.flag_reposicao)
      .map((p) => ({ aluno_id: p.aluno_id, aula_origem_id: aulaId })),
    ausentes: faltaram.map((p) => ({
      aluno_id: p.aluno_id,
      nome: matriculados.find((m) => m.aluno_id === p.aluno_id)!.nome,
    })),
    novoStatusAula: 'Realizada',
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- presencas/registro`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/presencas/
git commit -m "feat(dominio): registro de chamada e geracao de pendencia de reposicao"
```

---

### Task 7: Agendamento de reposição (TDD)

**Files:**
- Create: `src/dominio/reposicoes/agendamento.ts`
- Test: `src/dominio/reposicoes/agendamento.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/reposicoes/agendamento.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { planejarReposicao, validarDesistencia, type Pendencia, type AulaDestino } from './agendamento'

const pendencia: Pendencia = {
  id: 1,
  aluno_id: 10,
  aula_origem_id: 100,
  turma_origem_id: 50,
  status: 'Pendente',
}

const mesmaTurma: AulaDestino = { id: 101, turma_id: 50, status: 'Agendada' }
const outraTurma: AulaDestino = { id: 200, turma_id: 60, status: 'Agendada' }

describe('planejarReposicao', () => {
  it('na mesma turma, nao precisa de matricula nova', () => {
    const p = planejarReposicao(pendencia, mesmaTurma, [])
    expect(p.erros).toEqual([])
    expect(p.precisaMatricula).toBe(false)
  })

  it('em turma diferente, cria matricula de reposicao', () => {
    // Operacionais 5.4: a matricula existe so para permitir o registro de
    // presenca, e nao gera cobranca.
    const p = planejarReposicao(pendencia, outraTurma, [])
    expect(p.erros).toEqual([])
    expect(p.precisaMatricula).toBe(true)
    expect(p.matricula).toEqual({ aluno_id: 10, turma_id: 60, flag_reposicao: true })
  })

  it('nao duplica matricula se o aluno ja esta na turma de destino', () => {
    const p = planejarReposicao(pendencia, outraTurma, [{ aluno_id: 10, turma_id: 60 }])
    expect(p.precisaMatricula).toBe(false)
  })

  it('rejeita reposicao na propria aula da falta', () => {
    const p = planejarReposicao(pendencia, { id: 100, turma_id: 50, status: 'Agendada' }, [])
    expect(p.erros).toContain('A reposição não pode ser na mesma aula em que houve a falta.')
  })

  it('rejeita aula de destino cancelada', () => {
    const p = planejarReposicao(pendencia, { ...mesmaTurma, status: 'Cancelada' }, [])
    expect(p.erros).toContain('Esta aula está cancelada. Escolha outra.')
  })

  it('rejeita pendencia ja resolvida', () => {
    for (const status of ['Realizada', 'Desistida'] as const) {
      const p = planejarReposicao({ ...pendencia, status }, mesmaTurma, [])
      expect(p.erros).toContain('Esta reposição já foi encerrada.')
    }
  })

  it('permite reagendar uma reposicao ainda Agendada', () => {
    const p = planejarReposicao({ ...pendencia, status: 'Agendada' }, mesmaTurma, [])
    expect(p.erros).toEqual([])
  })

  it('a reposicao nunca gera cobranca', () => {
    // O aluno ja pagou pela aula original (Operacionais 5.4).
    const p = planejarReposicao(pendencia, outraTurma, [])
    expect(p.matricula?.flag_reposicao).toBe(true)
    expect(p.geraCobranca).toBe(false)
  })
})

describe('validarDesistencia', () => {
  it('aceita desistir de pendencia em aberto', () => {
    expect(validarDesistencia({ ...pendencia, status: 'Pendente' })).toEqual([])
    expect(validarDesistencia({ ...pendencia, status: 'Agendada' })).toEqual([])
  })

  it('rejeita desistir de reposicao ja realizada', () => {
    expect(validarDesistencia({ ...pendencia, status: 'Realizada' })).toContain(
      'Esta reposição já foi realizada.',
    )
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- reposicoes/agendamento`
Expected: FAIL — `Failed to resolve import "./agendamento"`

- [ ] **Step 3: Implementar**

`src/dominio/reposicoes/agendamento.ts`:
```ts
export type StatusReposicao = 'Pendente' | 'Agendada' | 'Realizada' | 'Desistida'

export interface Pendencia {
  id: number
  aluno_id: number
  aula_origem_id: number
  turma_origem_id: number
  status: StatusReposicao
}

export interface AulaDestino {
  id: number
  turma_id: number
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
}

export interface MatriculaExistente {
  aluno_id: number
  turma_id: number
}

export interface PlanoReposicao {
  erros: string[]
  precisaMatricula: boolean
  matricula: { aluno_id: number; turma_id: number; flag_reposicao: true } | null
  /** Sempre false: a reposicao nunca gera cobranca (Operacionais 5.4). */
  geraCobranca: false
}

/**
 * Modulos Operacionais 5.4. A gestora indica em qual aula o aluno fara a
 * reposicao — em geral na mesma turma, mas pode ser em outra. Quando e em outra,
 * o sistema cria uma matricula com flag_reposicao para permitir o registro de
 * presenca; essa matricula nunca entra na base de calculo de cobranca.
 */
export function planejarReposicao(
  pendencia: Pendencia,
  destino: AulaDestino,
  matriculasDoAluno: MatriculaExistente[],
): PlanoReposicao {
  const erros: string[] = []

  if (pendencia.status === 'Realizada' || pendencia.status === 'Desistida') {
    erros.push('Esta reposição já foi encerrada.')
  }

  if (destino.id === pendencia.aula_origem_id) {
    erros.push('A reposição não pode ser na mesma aula em que houve a falta.')
  }

  if (destino.status === 'Cancelada') {
    erros.push('Esta aula está cancelada. Escolha outra.')
  }

  const jaMatriculado = matriculasDoAluno.some(
    (m) => m.aluno_id === pendencia.aluno_id && m.turma_id === destino.turma_id,
  )
  const outraTurma = destino.turma_id !== pendencia.turma_origem_id
  const precisaMatricula = erros.length === 0 && outraTurma && !jaMatriculado

  return {
    erros,
    precisaMatricula,
    matricula: precisaMatricula
      ? { aluno_id: pendencia.aluno_id, turma_id: destino.turma_id, flag_reposicao: true }
      : null,
    geraCobranca: false,
  }
}

/** O aluno pode desistir da reposicao enquanto ela nao aconteceu. */
export function validarDesistencia(pendencia: Pendencia): string[] {
  return pendencia.status === 'Realizada' ? ['Esta reposição já foi realizada.'] : []
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 10 arquivos, 79 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/reposicoes/
git commit -m "feat(dominio): regras de agendamento e desistencia de reposicao"
```

---

### Task 8: Provedor de agenda

Duas implementações atrás de uma interface. É o que permite ligar o Google Calendar depois sem tocar em nada acima.

**Files:**
- Create: `src/agenda/provedor.ts`, `src/agenda/recorrencia-local.ts`, `src/agenda/google-calendar.ts`, `src/agenda/index.ts`

- [ ] **Step 1: Interface**

`src/agenda/provedor.ts`:
```ts
import type { OcorrenciaAula, RecorrenciaTurma } from '@/dominio/agenda/materializacao'

export interface TurmaParaSincronizar extends RecorrenciaTurma {
  google_calendar_event_id: string | null
  modalidade: 'Presencial' | 'Online'
}

export interface ProvedorAgenda {
  readonly nome: string
  /**
   * Ocorrencias da turma no intervalo [de, ate], datas em ISO.
   * Cada ocorrencia carrega um `google_calendar_event_id` estavel: e a chave
   * de idempotencia do upsert, e o que garante que ressincronizar nao duplica.
   */
  listarOcorrencias(
    turma: TurmaParaSincronizar,
    de: string,
    ate: string,
  ): Promise<OcorrenciaAula[]>
}
```

- [ ] **Step 2: Provedor local**

`src/agenda/recorrencia-local.ts`:
```ts
import { materializar } from '@/dominio/agenda/materializacao'
import type { ProvedorAgenda, TurmaParaSincronizar } from './provedor'

/**
 * Deriva as ocorrencias dos dias_semana e horarios da propria turma.
 * Nao depende de credencial nenhuma; e o provedor ativo enquanto o Google
 * Calendar nao estiver configurado.
 */
export const recorrenciaLocal: ProvedorAgenda = {
  nome: 'recorrencia-local',
  async listarOcorrencias(turma: TurmaParaSincronizar, de: string, ate: string) {
    return materializar(turma, de, ate)
  },
}
```

- [ ] **Step 3: Provedor Google, desligado**

`src/agenda/google-calendar.ts`:
```ts
import type { ProvedorAgenda, TurmaParaSincronizar } from './provedor'
import type { OcorrenciaAula } from '@/dominio/agenda/materializacao'

/**
 * Modulos Operacionais 4.3. Le as ocorrencias do evento recorrente vinculado a
 * turma (campo google_calendar_event_id) via Google Calendar API, com OAuth 2.0
 * autorizado uma unica vez pela gestora sobre a agenda compartilhada.
 *
 * Fica desligado ate GOOGLE_CALENDAR_ATIVO=true e as credenciais existirem.
 * A implementacao do fetch entra quando houver credencial para testar contra a
 * API real — escrever agora seria codigo nao verificavel.
 */
export const googleCalendar: ProvedorAgenda = {
  nome: 'google-calendar',
  async listarOcorrencias(
    turma: TurmaParaSincronizar,
    _de: string,
    _ate: string,
  ): Promise<OcorrenciaAula[]> {
    if (!turma.google_calendar_event_id) return []
    throw new Error(
      'Provedor Google Calendar ainda não implementado. ' +
        'Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET e mantenha ' +
        'GOOGLE_CALENDAR_ATIVO=false até a integração ser concluída.',
    )
  },
}
```

- [ ] **Step 4: Seleção por ambiente**

`src/agenda/index.ts`:
```ts
import { googleCalendar } from './google-calendar'
import { recorrenciaLocal } from './recorrencia-local'
import type { ProvedorAgenda } from './provedor'

export function provedorAtivo(): ProvedorAgenda {
  return process.env.GOOGLE_CALENDAR_ATIVO === 'true' ? googleCalendar : recorrenciaLocal
}

export type { ProvedorAgenda, TurmaParaSincronizar } from './provedor'
```

- [ ] **Step 5: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add src/agenda/
git commit -m "feat(agenda): provedor com recorrencia local e plugue para Google Calendar"
```

---

### Task 9: Sincronização de aulas

**Files:**
- Create: `src/dados/aulas.ts`

- [ ] **Step 1: Implementar**

`src/dados/aulas.ts`:
```ts
import 'server-only'
import { clienteServidor } from './cliente'
import { provedorAtivo } from '@/agenda'
import { conflitosComFeriado, type ConflitoFeriado } from '@/dominio/agenda/feriados'

export interface AulaComTurma {
  id: number
  turma_id: number
  google_calendar_event_id: string
  data_hora_inicio: string
  data_hora_fim: string
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
  link_online: string | null
  observacao: string | null
  turma: { id: number; nome: string; modalidade: string; professor_id: number } | null
}

const SELECT_AULA = `
  id, turma_id, google_calendar_event_id, data_hora_inicio, data_hora_fim,
  status, link_online, observacao,
  turma:turmas!turma_id (id, nome, modalidade, professor_id)
`

/**
 * Materializa as aulas das turmas ativas no intervalo e grava por upsert na
 * chave google_calendar_event_id. Reprocessar o mesmo intervalo nao duplica
 * nada — e a propriedade que o teste de determinismo em materializacao.test.ts
 * garante.
 *
 * `ignoreDuplicates` preserva o que ja existe: uma aula com presenca registrada
 * ou status ajustado a mao nao pode ser sobrescrita pela sincronizacao.
 */
export async function sincronizarAulas(
  de: string,
  ate: string,
): Promise<{ criadas: number; turmas: number }> {
  const supabase = await clienteServidor()
  const provedor = provedorAtivo()

  const { data: turmas, error } = await supabase
    .from('turmas')
    .select('id, dias_semana, horario_inicio, horario_fim, status, google_calendar_event_id, modalidade')
    .eq('status', 'Ativa')

  if (error) throw new Error(`Falha ao carregar turmas: ${error.message}`)

  let criadas = 0

  for (const turma of turmas ?? []) {
    const ocorrencias = await provedor.listarOcorrencias(
      {
        id: turma.id,
        dias_semana: turma.dias_semana ?? [],
        horario_inicio: String(turma.horario_inicio).slice(0, 5),
        horario_fim: String(turma.horario_fim).slice(0, 5),
        status: 'Ativa',
        google_calendar_event_id: turma.google_calendar_event_id,
        modalidade: turma.modalidade,
      },
      de,
      ate,
    )

    if (ocorrencias.length === 0) continue

    const linhas = ocorrencias.map((o) => ({
      turma_id: turma.id,
      google_calendar_event_id: o.google_calendar_event_id,
      data_hora_inicio: `${o.data}T${o.horario_inicio}:00`,
      data_hora_fim: `${o.data}T${o.horario_fim}:00`,
    }))

    const { data, error: erroUpsert } = await supabase
      .from('aulas')
      .upsert(linhas, { onConflict: 'google_calendar_event_id', ignoreDuplicates: true })
      .select('id')

    if (erroUpsert) throw new Error(`Falha ao sincronizar turma ${turma.id}: ${erroUpsert.message}`)
    criadas += data?.length ?? 0
  }

  return { criadas, turmas: turmas?.length ?? 0 }
}

export async function listarAulas(filtros: {
  de: string
  ate: string
  turmaId?: number
  professorId?: number
}): Promise<AulaComTurma[]> {
  const supabase = await clienteServidor()
  let consulta = supabase
    .from('aulas')
    .select(SELECT_AULA)
    .gte('data_hora_inicio', `${filtros.de}T00:00:00`)
    .lte('data_hora_inicio', `${filtros.ate}T23:59:59`)

  if (filtros.turmaId) consulta = consulta.eq('turma_id', filtros.turmaId)

  const { data, error } = await consulta.order('data_hora_inicio')
  if (error) throw new Error(`Falha ao listar aulas: ${error.message}`)

  const aulas = (data ?? []) as unknown as AulaComTurma[]
  return filtros.professorId
    ? aulas.filter((a) => a.turma?.professor_id === filtros.professorId)
    : aulas
}

export async function obterAula(id: number): Promise<AulaComTurma | null> {
  const supabase = await clienteServidor()
  const { data, error } = await supabase.from('aulas').select(SELECT_AULA).eq('id', id).maybeSingle()
  if (error) throw new Error(`Falha ao carregar aula: ${error.message}`)
  return (data ?? null) as unknown as AulaComTurma | null
}

/** Alunos com matricula ativa na turma na data da aula. */
export async function matriculadosNaAula(aulaId: number) {
  const supabase = await clienteServidor()
  const { data: aula } = await supabase
    .from('aulas')
    .select('turma_id, data_hora_inicio')
    .eq('id', aulaId)
    .maybeSingle()

  if (!aula) return []

  const dia = String(aula.data_hora_inicio).slice(0, 10)
  const { data } = await supabase
    .from('matriculas')
    .select('aluno_id, flag_reposicao, data_inicio, data_fim, aluno:alunos!aluno_id (id, nome)')
    .eq('turma_id', aula.turma_id)
    .eq('status', 'Ativa')
    .lte('data_inicio', dia)

  return ((data ?? []) as unknown as {
    aluno_id: number
    flag_reposicao: boolean
    data_fim: string | null
    aluno: { id: number; nome: string } | null
  }[])
    .filter((m) => !m.data_fim || m.data_fim >= dia)
    .map((m) => ({
      aluno_id: m.aluno_id,
      nome: m.aluno?.nome ?? 'Aluno removido',
      flag_reposicao: m.flag_reposicao,
    }))
}

/** Aulas agendadas que caem em feriado, para o alerta da gestora (RN 4.2). */
export async function conflitosDeFeriado(de: string, ate: string): Promise<ConflitoFeriado[]> {
  const supabase = await clienteServidor()
  const [aulas, feriados] = await Promise.all([
    supabase
      .from('aulas')
      .select('id, data_hora_inicio, status')
      .gte('data_hora_inicio', `${de}T00:00:00`)
      .lte('data_hora_inicio', `${ate}T23:59:59`),
    supabase.from('feriados').select('data, nome').gte('data', de).lte('data', ate),
  ])

  return conflitosComFeriado(
    (aulas.data ?? []).map((a) => ({
      id: a.id,
      data: String(a.data_hora_inicio).slice(0, 10),
      status: a.status,
    })),
    feriados.data ?? [],
  )
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros. Se aparecer TS2352 em algum cast de join, use o padrão `as unknown as Tipo[]`.

```bash
git add src/dados/aulas.ts
git commit -m "feat(dados): sincronizacao idempotente de aulas e conflito com feriado"
```

---

### Task 10: Provar a idempotência contra o banco real

Esta é a propriedade que impede aula duplicada em produção. Não basta o teste unitário: prove no banco.

**Files:**
- Create: `scripts/sincronizar.mjs`

- [ ] **Step 1: Escrever o script**

`scripts/sincronizar.mjs`:
```js
/**
 * Sincroniza a agenda pelo provedor local, direto no banco.
 *
 * Existe separado da aplicacao porque a sincronizacao periodica (Operacionais
 * 4.3) vai rodar fora do request: por cron ou job. Por ora e manual.
 *
 * Uso:
 *   node scripts/sincronizar.mjs 2026-08-01 2026-08-31
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { materializar } from '../src/dominio/agenda/materializacao.ts'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const [de, ate] = process.argv.slice(2)
if (!de || !ate) {
  console.error('Uso: node scripts/sincronizar.mjs <AAAA-MM-DD> <AAAA-MM-DD>')
  process.exit(1)
}

const { data: turmas } = await db
  .from('turmas')
  .select('id, nome, dias_semana, horario_inicio, horario_fim, status')
  .eq('status', 'Ativa')

let total = 0
for (const t of turmas ?? []) {
  const oc = materializar(
    {
      id: t.id,
      dias_semana: t.dias_semana ?? [],
      horario_inicio: String(t.horario_inicio).slice(0, 5),
      horario_fim: String(t.horario_fim).slice(0, 5),
      status: t.status,
    },
    de,
    ate,
  )
  if (oc.length === 0) continue

  const { data, error } = await db
    .from('aulas')
    .upsert(
      oc.map((o) => ({
        turma_id: t.id,
        google_calendar_event_id: o.google_calendar_event_id,
        data_hora_inicio: `${o.data}T${o.horario_inicio}:00`,
        data_hora_fim: `${o.data}T${o.horario_fim}:00`,
      })),
      { onConflict: 'google_calendar_event_id', ignoreDuplicates: true },
    )
    .select('id')

  if (error) {
    console.error(`Falha na turma ${t.id}: ${error.message}`)
    process.exit(1)
  }
  console.log(`  ${t.nome.slice(0, 50)}: ${oc.length} ocorrencias, ${data.length} novas`)
  total += data.length
}

const { count } = await db.from('aulas').select('*', { count: 'exact', head: true })
console.log(`\nCriadas agora: ${total}. Total de aulas no banco: ${count}.`)
```

Run: `npm install -D tsx` — o script importa um módulo TypeScript.

Ajuste o comando para: `node --experimental-strip-types scripts/sincronizar.mjs <de> <ate>`, ou rode via `npx tsx scripts/sincronizar.mjs <de> <ate>`. Escolha o que funcionar no Node instalado e registre no plano qual foi.

- [ ] **Step 2: A prova de idempotência**

```bash
npx tsx scripts/sincronizar.mjs 2026-08-01 2026-08-31
node scripts/consultar.mjs aulas --count
npx tsx scripts/sincronizar.mjs 2026-08-01 2026-08-31
node scripts/consultar.mjs aulas --count
```

Expected: a primeira execução cria N aulas. **A segunda deve reportar `0 novas` e a contagem total deve ser exatamente a mesma.** Se o número subir, a idempotência está quebrada — pare e reporte.

- [ ] **Step 3: Conferir os dados gerados**

```bash
node scripts/consultar.mjs aulas "id,turma_id,data_hora_inicio,status,google_calendar_event_id"
```
Expected: as datas caem nos dias da semana de cada turma (Matemática às terças e quintas, Português às quartas e sextas, Física às segundas), e todo `google_calendar_event_id` começa com `local:t`.

- [ ] **Step 4: Commit**

```bash
git add scripts/sincronizar.mjs package.json package-lock.json
git commit -m "feat(agenda): script de sincronizacao e prova de idempotencia"
```

---

### Task 11: Token de presença e registro da chamada

**Files:**
- Create: `src/dados/presencas.ts`

- [ ] **Step 1: Implementar**

`src/dados/presencas.ts`:
```ts
import 'server-only'
import { randomBytes } from 'node:crypto'
import { clienteAdmin } from './admin'
import { clienteServidor } from './cliente'
import { montarRegistro, type RespostaChamada } from '@/dominio/presencas/registro'

/** Validade padrao do link enviado ao professor. */
const HORAS_DE_VALIDADE = 48

export interface AulaDoFormulario {
  aula_id: number
  turma_nome: string
  data_hora_inicio: string
  professor_id: number | null
  alunos: { aluno_id: number; nome: string; flag_reposicao: boolean }[]
}

export async function gerarTokenPresenca(aulaId: number): Promise<string> {
  const supabase = await clienteServidor()

  const { data: aula } = await supabase
    .from('aulas')
    .select('id, turma:turmas!turma_id (professor_id)')
    .eq('id', aulaId)
    .maybeSingle()

  if (!aula) throw new Error('Aula não encontrada.')

  const token = randomBytes(24).toString('base64url')
  const expira = new Date(Date.now() + HORAS_DE_VALIDADE * 3600_000).toISOString()
  const turma = aula.turma as unknown as { professor_id: number } | null

  const { error } = await supabase.from('presenca_tokens').insert({
    token,
    aula_id: aulaId,
    professor_id: turma?.professor_id ?? null,
    expira_em: expira,
  })

  if (error) throw new Error(`Falha ao gerar o link: ${error.message}`)
  return token
}

/**
 * Le a aula pelo token, sem sessao. Roda apenas no servidor e usa a service
 * role key: o RLS nega acesso anonimo as tabelas, e a autorizacao aqui e o
 * proprio token — de uso unico e com validade.
 */
export async function aulaPorToken(token: string): Promise<
  { ok: true; aula: AulaDoFormulario } | { ok: false; motivo: string }
> {
  const admin = clienteAdmin()

  const { data: registro } = await admin
    .from('presenca_tokens')
    .select('token, aula_id, professor_id, expira_em, usado_em')
    .eq('token', token)
    .maybeSingle()

  if (!registro) return { ok: false, motivo: 'Este link não é válido.' }
  if (registro.usado_em) {
    return {
      ok: false,
      motivo: 'Esta chamada já foi confirmada. Peça à gestora para reabrir, se precisar corrigir.',
    }
  }
  if (new Date(registro.expira_em) < new Date()) {
    return { ok: false, motivo: 'Este link expirou. Peça um novo à gestora.' }
  }

  const { data: aula } = await admin
    .from('aulas')
    .select('id, data_hora_inicio, turma_id, turma:turmas!turma_id (nome)')
    .eq('id', registro.aula_id)
    .maybeSingle()

  if (!aula) return { ok: false, motivo: 'A aula deste link não existe mais.' }

  const dia = String(aula.data_hora_inicio).slice(0, 10)
  const { data: matriculas } = await admin
    .from('matriculas')
    .select('aluno_id, flag_reposicao, data_fim, aluno:alunos!aluno_id (nome)')
    .eq('turma_id', aula.turma_id)
    .eq('status', 'Ativa')
    .lte('data_inicio', dia)

  const alunos = ((matriculas ?? []) as unknown as {
    aluno_id: number
    flag_reposicao: boolean
    data_fim: string | null
    aluno: { nome: string } | null
  }[])
    .filter((m) => !m.data_fim || m.data_fim >= dia)
    .map((m) => ({
      aluno_id: m.aluno_id,
      nome: m.aluno?.nome ?? 'Aluno removido',
      flag_reposicao: m.flag_reposicao,
    }))

  const turma = aula.turma as unknown as { nome: string } | null

  return {
    ok: true,
    aula: {
      aula_id: aula.id,
      turma_nome: turma?.nome ?? 'Turma',
      data_hora_inicio: aula.data_hora_inicio,
      professor_id: registro.professor_id,
      alunos,
    },
  }
}

/**
 * Grava a chamada inteira: presencas, pendencias de reposicao, status da aula e
 * o consumo do token. Sequencia unica — se algo falhar no meio, o token nao e
 * marcado como usado e o professor pode reenviar.
 */
export async function registrarChamada(
  token: string,
  respostas: RespostaChamada[],
): Promise<{ ok: true; ausentes: string[] } | { ok: false; motivo: string }> {
  const leitura = await aulaPorToken(token)
  if (!leitura.ok) return { ok: false, motivo: leitura.motivo }

  const admin = clienteAdmin()
  const { aula } = leitura

  const resultado = montarRegistro({
    aulaId: aula.aula_id,
    professorId: aula.professor_id,
    matriculados: aula.alunos,
    respostas,
  })

  if (resultado.presencas.length > 0) {
    const { error } = await admin
      .from('presencas')
      .upsert(resultado.presencas, { onConflict: 'aula_id,aluno_id' })
    if (error) return { ok: false, motivo: `Falha ao gravar as presenças: ${error.message}` }
  }

  if (resultado.pendencias.length > 0) {
    const { error } = await admin
      .from('pendencias_reposicao')
      .upsert(resultado.pendencias, { onConflict: 'aluno_id,aula_origem_id', ignoreDuplicates: true })
    if (error) return { ok: false, motivo: `Falha ao registrar as reposições: ${error.message}` }
  }

  await admin.from('aulas').update({ status: resultado.novoStatusAula }).eq('id', aula.aula_id)
  await admin.from('presenca_tokens').update({ usado_em: new Date().toISOString() }).eq('token', token)

  await admin.from('logs_operacionais').insert({
    acao: 'registrar_chamada',
    entidade: 'aulas',
    entidade_id: aula.aula_id,
    usuario: `professor:${aula.professor_id ?? 'desconhecido'}`,
    detalhe: {
      presencas: resultado.presencas.length,
      ausentes: resultado.ausentes.length,
      pendencias_geradas: resultado.pendencias.length,
    },
  })

  return { ok: true, ausentes: resultado.ausentes.map((a) => a.nome) }
}

/** A gestora pode reabrir a chamada, conforme Operacionais 5.5. */
export async function reabrirChamada(token: string): Promise<void> {
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('presenca_tokens')
    .update({ usado_em: null, reaberto_em: new Date().toISOString() })
    .eq('token', token)
  if (error) throw new Error(`Falha ao reabrir: ${error.message}`)
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add src/dados/presencas.ts
git commit -m "feat(presencas): token de uso unico e registro completo da chamada"
```

---

## Continuação

As tarefas 12 a 20 cobrem as telas: agenda em calendário, detalhe da aula, o formulário público de presença, o painel de reposições, a fila de notificações e a verificação final ponta a ponta. Serão escritas na sequência.

## Cobertura do spec até aqui

| Requisito | Tarefas |
|---|---|
| §4.2 `aulas` | 1 |
| §4.2 `presencas`, `pendencias_reposicao` | 2 |
| §4.3 `presenca_tokens`, `notificacoes`, `logs_operacionais` | 2, 3 |
| §4.4 RLS de aulas e presenças | 1, 2 |
| §6 materialização idempotente | 4 |
| RN 4.2 alerta de feriado, sem decidir sozinho | 5 |
| RN 5.2 presença em lote e pendência | 6 |
| RN 5.4 reposição sem cobrança | 7 |
