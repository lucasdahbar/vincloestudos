# Mesinha Redonda OS — Plano 3: Cobranças, Recebimentos e Pagamentos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar a cobrança mensal consolidada por responsável, produzir o texto pronto para o WhatsApp, registrar recebimentos parciais e fechar o repasse devido a cada professor.

**Architecture:** Toda a aritmética financeira vive no domínio puro, em centavos inteiros, e é testada sem banco. A idempotência da cobrança é garantida **estruturalmente** por `UNIQUE(itens_cobranca.aula_id)`: reprocessar um mês não pode cobrar a mesma aula duas vezes, e essa garantia está no Postgres, não na aplicação. Valores usam sempre a vigência da data da aula, via `valor_servico_em()` e `percentual_professor_em()`, que já existem no banco.

**Tech Stack:** Next.js 16.3, React 19.2, TypeScript strict, Supabase Postgres remoto, Tailwind v4, Motion, Zod 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-13-mesinha-redonda-design.md` (§5.1, §5.3, §5.4)
**Planos anteriores:** `2026-08-13-fundacao-e-cadastros.md` e `2026-08-13-agenda-presencas-reposicoes.md` — ambos concluídos

---

## Estado ao iniciar

| Item | Situação |
|---|---|
| Banco | Supabase remoto `ixegxvjimyhlvkyarcyr`, **10 migrations** |
| Tabelas | cadastros, turmas, matrículas, aulas, presenças, pendências, tokens, notificações, logs |
| Domínio | dinheiro, tipos, turmas, matrículas, agenda, presenças, reposições — **81 testes** |
| Telas | cadastros, turmas, matrículas, agenda, reposições, formulário público de presença |
| Verificação | `node scripts/verificar-e2e.mjs` → **22 ok** |
| Dados | seed + 21 aulas de agosto/2026 sincronizadas, 1 chamada registrada com 1 falta |

Funções SQL já disponíveis e que este plano usa:
- `public.valor_servico_em(servico_id, data)` → valor vigente do serviço naquela data
- `public.percentual_professor_em(professor_id, data)` → percentual vigente do professor
- `public.e_gestora()`, `public.professor_do_usuario()`

## Regras do ambiente — cada uma custou um bug real

| Regra | Detalhe |
|---|---|
| **Nunca `supabase db reset`** | Projeto remoto vinculado: `reset` apaga o banco. Use `npx supabase db push`. |
| **Token do CLI** | `export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local \| cut -d= -f2- \| tr -d '\r')` |
| **Sem `db psql`** | Use `node scripts/consultar.mjs <tabela> [colunas]`. |
| **Fronteira Server → Client** | Só objetos simples atravessam. Classe (schema Zod, `Date`) quebra em **runtime**, com build e `tsc` limpos. |
| **Nomes de arquivo** | NTFS é case-insensitive: `acoes.ts` e `Acoes.tsx` na mesma pasta fazem o `tsc` falhar com TS1149. Use nomes distintos. |
| **Tailwind v4** | `rounded-campo`, `rounded-cartao`, `shadow-cartao`, `font-titulo`. Nunca `rounded-[--radius-cartao]`. |
| **Zod 4** | `z.enum(arrayReadonly)`, `z.number({ message })`. |
| **CHECK com array** | `cardinality(arr)`, nunca `array_length(arr, 1)` — este devolve NULL e a CHECK passa. |
| **Dinheiro** | **Nunca** ponto flutuante. Centavos inteiros no TS (`src/dominio/dinheiro.ts`), `numeric(12,2)` no banco. |
| **Verificação** | 307 só prova que a rota existe. Use `node scripts/verificar-e2e.mjs`. |
| **Shell** | Todo comando com `< /dev/null`. Caminhos com `(` `[` entre aspas. |
| **Servidor dev** | Há um `next dev` na 3000 que você não iniciou. Não derrube. |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/dominio/cobrancas/geracao.ts` | Seleção da base de cálculo e montagem dos itens |
| `src/dominio/cobrancas/texto.ts` | Texto formatado para WhatsApp |
| `src/dominio/recebimentos/quitacao.ts` | Saldo e transição de status |
| `src/dominio/pagamentos/fechamento.ts` | Repasse por presença confirmada |
| `src/dados/cobrancas.ts` | Geração, ajuste e confirmação |
| `src/dados/recebimentos.ts` | Baixa e saldo |
| `src/dados/pagamentos.ts` | Fechamento e relatório |
| `src/app/(app)/cobrancas/` | Geração mensal e detalhe |
| `src/app/(app)/recebimentos/` | Cobranças em aberto e baixa |
| `src/app/(app)/pagamentos/` | Fechamento e contas a pagar |
| `src/app/(app)/page.tsx` | Painel inicial |

---

### Task 1: Migration — cobranças e recebimentos

**Files:**
- Create: `supabase/migrations/20260815000100_cobrancas.sql`

- [ ] **Step 1: Escrever a migration**

```sql
create type public.status_cobranca as enum
  ('Rascunho', 'Confirmada', 'Enviada', 'Quitada', 'Parcial');
create type public.forma_pagamento as enum
  ('Pix', 'Dinheiro', 'Transferência', 'Cartão', 'Outros');

-- Fatura mensal antecipada de um responsavel, agrupando todos os filhos e
-- todas as turmas em que estejam matriculados (Operacionais 6.3).
create table public.cobrancas (
  id bigint generated always as identity primary key,
  responsavel_id bigint not null references public.responsaveis (id) on delete restrict,
  mes_referencia date not null,
  data_geracao timestamptz not null default now(),
  valor_bruto numeric(12, 2) not null default 0,
  valor_desconto numeric(12, 2) not null default 0,
  valor_total numeric(12, 2) not null default 0,
  status public.status_cobranca not null default 'Rascunho',
  texto_whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma cobranca por responsavel por mes.
  unique (responsavel_id, mes_referencia),
  constraint valores_nao_negativos check (
    valor_bruto >= 0 and valor_desconto >= 0 and valor_total >= 0
  )
);

comment on column public.cobrancas.mes_referencia is
  'Sempre o dia 1 do mes de referencia.';
comment on column public.cobrancas.status is
  'Enviada existe desde ja, marcada a mao, para que uma futura integracao com
   API de WhatsApp apenas automatize a transicao (Operacionais 6.5).';

create index on public.cobrancas (mes_referencia desc);
create index on public.cobrancas (status);

create table public.itens_cobranca (
  id bigint generated always as identity primary key,
  cobranca_id bigint not null references public.cobrancas (id) on delete cascade,
  aluno_id bigint not null references public.alunos (id) on delete restrict,
  -- ESTA e a garantia de idempotencia da cobranca. Reprocessar a geracao de um
  -- mes nao pode cobrar a mesma aula duas vezes, e a garantia vive no banco,
  -- nao na aplicacao (RNF de idempotencia).
  aula_id bigint not null unique references public.aulas (id) on delete restrict,
  descricao text not null,
  valor_original numeric(12, 2) not null check (valor_original > 0),
  desconto numeric(12, 2) not null default 0 check (desconto >= 0),
  valor_final numeric(12, 2) not null check (valor_final >= 0),
  constraint desconto_nao_supera_valor check (desconto <= valor_original)
);

create index on public.itens_cobranca (cobranca_id);
create index on public.itens_cobranca (aluno_id);

create table public.recebimentos (
  id bigint generated always as identity primary key,
  cobranca_id bigint not null references public.cobrancas (id) on delete cascade,
  valor_recebido numeric(12, 2) not null check (valor_recebido > 0),
  data_recebimento date not null default current_date,
  conta_id bigint not null references public.contas (id) on delete restrict,
  forma_pagamento public.forma_pagamento,
  observacao text,
  registrado_por text,
  created_at timestamptz not null default now()
);

create index on public.recebimentos (cobranca_id);

create trigger tocar_updated_at before update on public.cobrancas
  for each row execute function public.tocar_updated_at();

alter table public.cobrancas enable row level security;
alter table public.itens_cobranca enable row level security;
alter table public.recebimentos enable row level security;

-- Dado financeiro e exclusivo da gestora: nenhuma policy para professor.
create policy "gestora total" on public.cobrancas for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "gestora total" on public.itens_cobranca for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "gestora total" on public.recebimentos for all
  using (public.e_gestora()) with check (public.e_gestora());
```

- [ ] **Step 2: Aplicar**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r')
npx supabase db push < /dev/null
node scripts/consultar.mjs cobrancas --count
```
Expected: push sem erro, `cobrancas: 0 registro(s)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260815000100_cobrancas.sql
git commit -m "feat(banco): cobrancas, itens e recebimentos com idempotencia por aula"
```

---

### Task 2: Migration — pagamentos a professores

**Files:**
- Create: `supabase/migrations/20260815000200_pagamentos.sql`

- [ ] **Step 1: Escrever a migration**

```sql
create type public.status_conta_pagar as enum ('Pendente', 'Pago');

create table public.contas_pagar_professor (
  id bigint generated always as identity primary key,
  professor_id bigint not null references public.professores (id) on delete restrict,
  periodo_inicio date not null,
  periodo_fim date not null,
  valor_total numeric(12, 2) not null default 0 check (valor_total >= 0),
  status public.status_conta_pagar not null default 'Pendente',
  data_pagamento date,
  conta_id bigint references public.contas (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periodo_coerente check (periodo_fim >= periodo_inicio)
);

create index on public.contas_pagar_professor (professor_id, periodo_inicio desc);

-- Snapshot do relatorio de fechamento (Operacionais 8.3). Materializa aluno,
-- turma, data e valores no momento do fechamento: se o percentual do professor
-- ou o valor do servico mudarem depois, o historico do que foi pago nao muda.
create table public.itens_conta_pagar_professor (
  id bigint generated always as identity primary key,
  conta_pagar_id bigint not null
    references public.contas_pagar_professor (id) on delete cascade,
  presenca_id bigint not null unique references public.presencas (id) on delete restrict,
  aluno_id bigint not null references public.alunos (id) on delete restrict,
  turma_id bigint not null references public.turmas (id) on delete restrict,
  data_aula date not null,
  valor_servico numeric(12, 2) not null,
  percentual_aplicado numeric(5, 2) not null,
  valor_professor numeric(12, 2) not null
);

comment on column public.itens_conta_pagar_professor.presenca_id is
  'UNIQUE: uma presenca confirmada so pode ser paga uma vez, mesmo que a gestora
   refaca o fechamento de um periodo sobreposto.';

create index on public.itens_conta_pagar_professor (conta_pagar_id);

create trigger tocar_updated_at before update on public.contas_pagar_professor
  for each row execute function public.tocar_updated_at();

alter table public.contas_pagar_professor enable row level security;
alter table public.itens_conta_pagar_professor enable row level security;

create policy "gestora total" on public.contas_pagar_professor for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "gestora total" on public.itens_conta_pagar_professor for all
  using (public.e_gestora()) with check (public.e_gestora());

-- O professor pode ver os proprios fechamentos (Operacionais, Navegacao §9).
create policy "professor le seus fechamentos" on public.contas_pagar_professor
  for select to authenticated
  using (professor_id = public.professor_do_usuario());
```

- [ ] **Step 2: Aplicar e commitar**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '\r')
npx supabase db push < /dev/null
node scripts/consultar.mjs contas_pagar_professor --count

git add supabase/migrations/20260815000200_pagamentos.sql
git commit -m "feat(banco): contas a pagar de professor com snapshot do fechamento"
```

---

### Task 3: Geração de cobrança (TDD)

A regra com maior consequência financeira do sistema inteiro. Puro, sem banco.

**Files:**
- Create: `src/dominio/cobrancas/geracao.ts`
- Test: `src/dominio/cobrancas/geracao.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/cobrancas/geracao.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { montarCobrancas, type AulaFaturavel } from './geracao'

const base: AulaFaturavel = {
  aula_id: 1,
  aluno_id: 10,
  aluno_nome: 'João',
  responsavel_id: 100,
  responsavel_nome: 'Ana Ribeiro',
  data: '2026-08-04',
  descricao: 'Matemática 9º ano — Aula regular',
  valor: 10000,
  status_aula: 'Agendada',
  matricula_ativa: true,
  matricula_reposicao: false,
  ja_cobrada: false,
}

describe('montarCobrancas', () => {
  it('agrupa por responsavel', () => {
    const c = montarCobrancas([
      base,
      { ...base, aula_id: 2, aluno_id: 11, aluno_nome: 'Maria' },
      { ...base, aula_id: 3, responsavel_id: 200, responsavel_nome: 'Marcos', aluno_id: 12 },
    ])
    expect(c).toHaveLength(2)
    expect(c[0].responsavel_id).toBe(100)
    expect(c[0].itens).toHaveLength(2)
  })

  it('soma o valor bruto e o total', () => {
    const [c] = montarCobrancas([base, { ...base, aula_id: 2, valor: 5000 }])
    expect(c.valor_bruto).toBe(15000)
    expect(c.valor_desconto).toBe(0)
    expect(c.valor_total).toBe(15000)
  })

  it('EXCLUI aula de matricula de reposicao', () => {
    // A reposicao nao gera cobranca: o aluno ja pagou pela aula original.
    const c = montarCobrancas([base, { ...base, aula_id: 2, matricula_reposicao: true }])
    expect(c[0].itens).toHaveLength(1)
    expect(c[0].itens[0].aula_id).toBe(1)
  })

  it('EXCLUI aula ja cobrada em outra geracao', () => {
    // Idempotencia: reprocessar o mes nao duplica item.
    const c = montarCobrancas([base, { ...base, aula_id: 2, ja_cobrada: true }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('EXCLUI aula cancelada', () => {
    const c = montarCobrancas([base, { ...base, aula_id: 2, status_aula: 'Cancelada' }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('EXCLUI aula marcada como feriado', () => {
    const c = montarCobrancas([base, { ...base, aula_id: 2, status_aula: 'Feriado' }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('EXCLUI aula de matricula inativa', () => {
    const c = montarCobrancas([base, { ...base, aula_id: 2, matricula_ativa: false }])
    expect(c[0].itens).toHaveLength(1)
  })

  it('nao gera cobranca para responsavel sem aula faturavel', () => {
    expect(montarCobrancas([{ ...base, matricula_reposicao: true }])).toEqual([])
  })

  it('e idempotente: rodar de novo com tudo ja cobrado nao gera nada', () => {
    const primeira = montarCobrancas([base, { ...base, aula_id: 2 }])
    expect(primeira[0].itens).toHaveLength(2)

    const segunda = montarCobrancas([
      { ...base, ja_cobrada: true },
      { ...base, aula_id: 2, ja_cobrada: true },
    ])
    expect(segunda).toEqual([])
  })

  it('preserva a ordem cronologica dos itens', () => {
    const [c] = montarCobrancas([
      { ...base, aula_id: 2, data: '2026-08-20' },
      { ...base, aula_id: 1, data: '2026-08-04' },
    ])
    expect(c.itens.map((i) => i.data)).toEqual(['2026-08-04', '2026-08-20'])
  })

  it('mantem os alunos separados dentro da mesma cobranca', () => {
    const [c] = montarCobrancas([
      base,
      { ...base, aula_id: 2, aluno_id: 11, aluno_nome: 'Maria', valor: 8000 },
    ])
    expect(new Set(c.itens.map((i) => i.aluno_id))).toEqual(new Set([10, 11]))
    expect(c.valor_total).toBe(18000)
  })

  it('nao usa ponto flutuante: valores em centavos somam exato', () => {
    const [c] = montarCobrancas(
      Array.from({ length: 3 }, (_, i) => ({ ...base, aula_id: i + 1, valor: 10 })),
    )
    expect(c.valor_total).toBe(30)
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- cobrancas/geracao`
Expected: FAIL — `Failed to resolve import "./geracao"`

- [ ] **Step 3: Implementar**

`src/dominio/cobrancas/geracao.ts`:
```ts
import { somar, type Centavos } from '@/dominio/dinheiro'

export interface AulaFaturavel {
  aula_id: number
  aluno_id: number
  aluno_nome: string
  responsavel_id: number
  responsavel_nome: string
  /** Data da aula em ISO, AAAA-MM-DD. */
  data: string
  descricao: string
  /** Valor do servico VIGENTE NA DATA DA AULA, em centavos. */
  valor: Centavos
  status_aula: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
  matricula_ativa: boolean
  matricula_reposicao: boolean
  /** Ja presente em algum item de cobranca. */
  ja_cobrada: boolean
}

export interface ItemMontado {
  aula_id: number
  aluno_id: number
  aluno_nome: string
  data: string
  descricao: string
  valor_original: Centavos
  desconto: Centavos
  valor_final: Centavos
}

export interface CobrancaMontada {
  responsavel_id: number
  responsavel_nome: string
  itens: ItemMontado[]
  valor_bruto: Centavos
  valor_desconto: Centavos
  valor_total: Centavos
}

/**
 * Modulos Operacionais 6.3. A base de calculo sao as aulas previstas no mes,
 * de matriculas ativas e NAO marcadas como reposicao, que ainda nao entraram em
 * nenhum item de cobranca.
 *
 * Aula cancelada ou em feriado nao gera cobranca (RN 4.2). A reposicao tambem
 * nao: o aluno ja pagou pela aula original (RN 5.4).
 *
 * A exclusao de `ja_cobrada` e o que torna a geracao idempotente do lado da
 * aplicacao; do lado do banco, `UNIQUE(itens_cobranca.aula_id)` garante o mesmo
 * mesmo que dois processos rodem ao mesmo tempo.
 */
export function faturavel(aula: AulaFaturavel): boolean {
  return (
    aula.matricula_ativa &&
    !aula.matricula_reposicao &&
    !aula.ja_cobrada &&
    (aula.status_aula === 'Agendada' || aula.status_aula === 'Realizada')
  )
}

export function montarCobrancas(aulas: AulaFaturavel[]): CobrancaMontada[] {
  const porResponsavel = new Map<number, AulaFaturavel[]>()

  for (const aula of aulas.filter(faturavel)) {
    porResponsavel.set(aula.responsavel_id, [
      ...(porResponsavel.get(aula.responsavel_id) ?? []),
      aula,
    ])
  }

  return [...porResponsavel.entries()].map(([responsavelId, doResponsavel]) => {
    const itens: ItemMontado[] = doResponsavel
      .slice()
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((a) => ({
        aula_id: a.aula_id,
        aluno_id: a.aluno_id,
        aluno_nome: a.aluno_nome,
        data: a.data,
        descricao: a.descricao,
        valor_original: a.valor,
        desconto: 0,
        valor_final: a.valor,
      }))

    const valorBruto = somar(...itens.map((i) => i.valor_original))
    const valorDesconto = somar(...itens.map((i) => i.desconto))

    return {
      responsavel_id: responsavelId,
      responsavel_nome: doResponsavel[0].responsavel_nome,
      itens,
      valor_bruto: valorBruto,
      valor_desconto: valorDesconto,
      valor_total: valorBruto - valorDesconto,
    }
  })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- cobrancas/geracao`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/cobrancas/
git commit -m "feat(dominio): geracao idempotente de cobranca por responsavel"
```

---

### Task 4: Texto para WhatsApp (TDD)

O documento de requisitos (§6.4) traz um exemplo literal. O teste reproduz esse exemplo — é a especificação.

**Files:**
- Create: `src/dominio/cobrancas/texto.ts`
- Test: `src/dominio/cobrancas/texto.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/cobrancas/texto.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { gerarTextoCobranca, type DadosDoTexto } from './texto'

const dados: DadosDoTexto = {
  responsavel_nome: 'Ana Ribeiro',
  mes_referencia: '2026-08-01',
  valor_total: 90500,
  chave_pix: 'mesinharedonda@email.com',
  vencimento: '2026-08-05',
  itens: [
    {
      aluno_nome: 'João',
      contexto: '9º ano — Matemática',
      descricao: 'Aulão de revisão',
      data: '2026-08-10',
      valor_final: 10500,
    },
    ...Array.from({ length: 8 }, (_, i) => ({
      aluno_nome: 'Maria',
      contexto: '7º ano — Português',
      descricao: 'Aula regular',
      data: `2026-08-${String(5 + i * 3).padStart(2, '0')}`,
      valor_final: 10000,
    })),
  ],
}

describe('gerarTextoCobranca', () => {
  const texto = gerarTextoCobranca(dados)

  it('abre saudando o responsavel pelo primeiro nome', () => {
    expect(texto).toContain('Olá, Ana!')
  })

  it('diz o mes de referencia por extenso', () => {
    expect(texto).toContain('agosto/2026')
  })

  it('agrupa por aluno, com o contexto entre parenteses', () => {
    expect(texto).toContain('João (9º ano — Matemática)')
    expect(texto).toContain('Maria (7º ano — Português)')
  })

  it('resume itens repetidos com a quantidade', () => {
    expect(texto).toContain('1x Aulão de revisão')
    expect(texto).toContain('8x Aula regular')
  })

  it('mostra o intervalo de datas quando ha mais de uma aula', () => {
    expect(texto).toContain('(05/08 a 26/08)')
  })

  it('nao mostra intervalo quando ha uma aula so', () => {
    const linha = texto.split('\n').find((l) => l.includes('Aulão de revisão'))!
    expect(linha).not.toContain(' a ')
  })

  it('soma o valor de cada grupo', () => {
    expect(texto).toContain('R$ 105,00')
    expect(texto).toContain('R$ 800,00')
  })

  it('fecha com o total liquido', () => {
    expect(texto).toContain('TOTAL: R$ 905,00')
  })

  it('inclui a chave Pix e o vencimento', () => {
    expect(texto).toContain('Pix: mesinharedonda@email.com')
    expect(texto).toContain('Vencimento: 05/08/2026')
  })

  it('omite a linha de Pix quando nao ha chave cadastrada', () => {
    const semPix = gerarTextoCobranca({ ...dados, chave_pix: null })
    expect(semPix).not.toContain('Pix:')
    expect(semPix).toContain('TOTAL:')
  })

  it('funciona com um unico aluno e um unico item', () => {
    const t = gerarTextoCobranca({
      ...dados,
      valor_total: 10000,
      itens: [
        {
          aluno_nome: 'Pedro',
          contexto: '8º ano — Física',
          descricao: 'Aula regular',
          data: '2026-08-11',
          valor_final: 10000,
        },
      ],
    })
    expect(t).toContain('Pedro (8º ano — Física)')
    expect(t).toContain('1x Aula regular')
    expect(t).toContain('TOTAL: R$ 100,00')
  })

  it('e texto puro, pronto para colar no WhatsApp', () => {
    expect(texto).not.toMatch(/<[a-z]/i)
    expect(texto.split('\n').length).toBeGreaterThan(5)
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- cobrancas/texto`
Expected: FAIL — `Failed to resolve import "./texto"`

- [ ] **Step 3: Implementar**

`src/dominio/cobrancas/texto.ts`:
```ts
import { formatarBRL, somar, type Centavos } from '@/dominio/dinheiro'

export interface ItemDoTexto {
  aluno_nome: string
  /** Ano escolar e materia, como "9º ano — Matemática". */
  contexto: string
  descricao: string
  data: string
  valor_final: Centavos
}

export interface DadosDoTexto {
  responsavel_nome: string
  /** Primeiro dia do mes, em ISO. */
  mes_referencia: string
  valor_total: Centavos
  chave_pix: string | null
  /** Data de vencimento em ISO. */
  vencimento: string
  itens: ItemDoTexto[]
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function mesPorExtenso(iso: string): string {
  const [ano, mes] = iso.split('-').map(Number)
  return `${MESES[mes - 1]}/${ano}`
}

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

function dataCompleta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Largura da coluna de pontinhos, para os valores alinharem no WhatsApp. */
const LARGURA = 38

/**
 * Modulos Operacionais 6.4. Monta o texto pronto para a gestora copiar e enviar,
 * agrupando por aluno e, dentro de cada aluno, resumindo itens iguais com a
 * quantidade e o intervalo de datas.
 *
 * O valor exibido no total e sempre o valor_total, ja liquido de descontos.
 */
export function gerarTextoCobranca(dados: DadosDoTexto): string {
  const primeiroNome = dados.responsavel_nome.trim().split(/\s+/)[0]
  const linhas: string[] = [
    `Olá, ${primeiroNome}! Segue a cobrança referente a ${mesPorExtenso(dados.mes_referencia)}:`,
    '',
  ]

  // Agrupa por aluno preservando a ordem de entrada.
  const porAluno = new Map<string, ItemDoTexto[]>()
  for (const item of dados.itens) {
    const chave = `${item.aluno_nome}|${item.contexto}`
    porAluno.set(chave, [...(porAluno.get(chave) ?? []), item])
  }

  for (const [chave, doAluno] of porAluno) {
    const [nome, contexto] = chave.split('|')
    linhas.push(`${nome} (${contexto})`)

    // Dentro do aluno, resume itens com a mesma descricao.
    const porDescricao = new Map<string, ItemDoTexto[]>()
    for (const item of doAluno) {
      porDescricao.set(item.descricao, [...(porDescricao.get(item.descricao) ?? []), item])
    }

    for (const [descricao, grupo] of porDescricao) {
      const datas = grupo.map((g) => g.data).sort()
      const periodo =
        grupo.length > 1 ? ` (${dataCurta(datas[0])} a ${dataCurta(datas[datas.length - 1])})` : ''
      const rotulo = `${grupo.length}x ${descricao}${periodo}`
      const valor = formatarBRL(somar(...grupo.map((g) => g.valor_final)))
      const pontos = '.'.repeat(Math.max(1, LARGURA - rotulo.length))
      linhas.push(`${rotulo} ${pontos} ${valor}`)
    }

    linhas.push('')
  }

  linhas.push(`TOTAL: ${formatarBRL(dados.valor_total)}`)
  linhas.push('')

  const rodape = dados.chave_pix
    ? `Pix: ${dados.chave_pix} — Vencimento: ${dataCompleta(dados.vencimento)}`
    : `Vencimento: ${dataCompleta(dados.vencimento)}`
  linhas.push(rodape)

  return linhas.join('\n')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- cobrancas/texto`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/cobrancas/texto.ts src/dominio/cobrancas/texto.test.ts
git commit -m "feat(dominio): texto de cobranca formatado para WhatsApp"
```

---

### Task 5: Quitação e saldo (TDD)

**Files:**
- Create: `src/dominio/recebimentos/quitacao.ts`
- Test: `src/dominio/recebimentos/quitacao.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/recebimentos/quitacao.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { saldoEStatus, validarRecebimento } from './quitacao'

describe('saldoEStatus', () => {
  it('sem recebimento, mantem o status atual e o saldo cheio', () => {
    expect(saldoEStatus(90500, [], 'Confirmada')).toEqual({ saldo: 90500, status: 'Confirmada' })
  })

  it('pagamento parcial deixa a cobranca Parcial', () => {
    expect(saldoEStatus(90500, [50000], 'Confirmada')).toEqual({ saldo: 40500, status: 'Parcial' })
  })

  it('pagamento exato quita', () => {
    expect(saldoEStatus(90500, [90500], 'Confirmada')).toEqual({ saldo: 0, status: 'Quitada' })
  })

  it('pagamento acima do total quita e o saldo nao fica negativo', () => {
    expect(saldoEStatus(90500, [100000], 'Confirmada')).toEqual({ saldo: 0, status: 'Quitada' })
  })

  it('soma varios recebimentos ate quitar', () => {
    expect(saldoEStatus(90500, [30000, 30000, 30500], 'Parcial')).toEqual({
      saldo: 0,
      status: 'Quitada',
    })
  })

  it('preserva o status Enviada quando ainda nao houve pagamento', () => {
    expect(saldoEStatus(90500, [], 'Enviada')).toEqual({ saldo: 90500, status: 'Enviada' })
  })

  it('nao acumula erro de ponto flutuante', () => {
    expect(saldoEStatus(30, [10, 20], 'Confirmada')).toEqual({ saldo: 0, status: 'Quitada' })
  })
})

describe('validarRecebimento', () => {
  it('aceita valor dentro do saldo', () => {
    expect(validarRecebimento(50000, 90500, 1)).toEqual([])
  })

  it('aceita quitar o saldo exato', () => {
    expect(validarRecebimento(90500, 90500, 1)).toEqual([])
  })

  it('rejeita valor zero ou negativo', () => {
    expect(validarRecebimento(0, 90500, 1)).toContain('O valor recebido deve ser maior que zero.')
    expect(validarRecebimento(-100, 90500, 1)).toContain('O valor recebido deve ser maior que zero.')
  })

  it('exige a conta de destino', () => {
    expect(validarRecebimento(50000, 90500, null)).toContain('Selecione a conta que recebeu o valor.')
  })

  it('rejeita baixa em cobranca ja quitada', () => {
    expect(validarRecebimento(1000, 0, 1)).toContain('Esta cobrança já está quitada.')
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- recebimentos/quitacao`
Expected: FAIL — `Failed to resolve import "./quitacao"`

- [ ] **Step 3: Implementar**

`src/dominio/recebimentos/quitacao.ts`:
```ts
import { somar, type Centavos } from '@/dominio/dinheiro'

export type StatusCobranca = 'Rascunho' | 'Confirmada' | 'Enviada' | 'Quitada' | 'Parcial'

/**
 * Modulos Operacionais 7.2. Se a soma dos recebimentos iguala ou supera o total,
 * a cobranca fica Quitada; se e menor mas maior que zero, fica Parcial. Sem
 * recebimento nenhum, o status atual e preservado (Confirmada ou Enviada).
 */
export function saldoEStatus(
  valorTotal: Centavos,
  recebimentos: Centavos[],
  statusAtual: StatusCobranca,
): { saldo: Centavos; status: StatusCobranca } {
  const recebido = somar(...recebimentos)

  if (recebido <= 0) return { saldo: valorTotal, status: statusAtual }
  if (recebido >= valorTotal) return { saldo: 0, status: 'Quitada' }
  return { saldo: valorTotal - recebido, status: 'Parcial' }
}

export function validarRecebimento(
  valor: Centavos,
  saldoEmAberto: Centavos,
  contaId: number | null,
): string[] {
  const erros: string[] = []

  if (valor <= 0) erros.push('O valor recebido deve ser maior que zero.')
  if (contaId === null) erros.push('Selecione a conta que recebeu o valor.')
  if (saldoEmAberto <= 0) erros.push('Esta cobrança já está quitada.')

  return erros
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test -- recebimentos/quitacao`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/recebimentos/
git commit -m "feat(dominio): saldo e transicao de status por quitacao"
```

---

### Task 6: Fechamento do professor (TDD)

**Files:**
- Create: `src/dominio/pagamentos/fechamento.ts`
- Test: `src/dominio/pagamentos/fechamento.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`src/dominio/pagamentos/fechamento.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { calcularFechamento, type PresencaRemunerada } from './fechamento'

const base: PresencaRemunerada = {
  presenca_id: 1,
  aluno_id: 10,
  aluno_nome: 'João',
  turma_id: 5,
  turma_nome: 'Matemática 9º ano',
  data_aula: '2026-08-04',
  presente: true,
  flag_reposicao: false,
  valor_servico: 10000,
  percentual: 60,
  ja_paga: false,
}

describe('calcularFechamento', () => {
  it('calcula valor do servico x percentual do professor', () => {
    const f = calcularFechamento([base])
    expect(f.itens[0].valor_professor).toBe(6000)
    expect(f.valor_total).toBe(6000)
  })

  it('soma varias presencas', () => {
    const f = calcularFechamento([base, { ...base, presenca_id: 2 }, { ...base, presenca_id: 3 }])
    expect(f.valor_total).toBe(18000)
    expect(f.itens).toHaveLength(3)
  })

  it('IGNORA ausencia: so presenca confirmada gera valor', () => {
    const f = calcularFechamento([base, { ...base, presenca_id: 2, presente: false }])
    expect(f.itens).toHaveLength(1)
    expect(f.valor_total).toBe(6000)
  })

  it('INCLUI presenca em aula de reposicao', () => {
    // O professor que ministrou a reposicao recebe normalmente (RN 5.4).
    const f = calcularFechamento([{ ...base, flag_reposicao: true }])
    expect(f.valor_total).toBe(6000)
  })

  it('IGNORA presenca ja paga em outro fechamento', () => {
    const f = calcularFechamento([base, { ...base, presenca_id: 2, ja_paga: true }])
    expect(f.itens).toHaveLength(1)
  })

  it('usa o percentual vigente na data de cada aula', () => {
    // Mudanca de percentual nao afeta o historico (RN 8.2).
    const f = calcularFechamento([
      { ...base, presenca_id: 1, percentual: 60 },
      { ...base, presenca_id: 2, percentual: 55 },
    ])
    expect(f.itens.map((i) => i.valor_professor)).toEqual([6000, 5500])
    expect(f.valor_total).toBe(11500)
  })

  it('usa o valor do servico vigente na data de cada aula', () => {
    const f = calcularFechamento([
      { ...base, presenca_id: 1, valor_servico: 10000 },
      { ...base, presenca_id: 2, valor_servico: 12000 },
    ])
    expect(f.itens.map((i) => i.valor_professor)).toEqual([6000, 7200])
  })

  it('arredonda meio para cima em percentual quebrado', () => {
    const f = calcularFechamento([{ ...base, valor_servico: 10001, percentual: 33.33 }])
    expect(f.itens[0].valor_professor).toBe(3333)
  })

  it('devolve zero quando nao ha presenca remunerada', () => {
    expect(calcularFechamento([])).toEqual({ itens: [], valor_total: 0 })
    expect(calcularFechamento([{ ...base, presente: false }])).toEqual({ itens: [], valor_total: 0 })
  })

  it('preserva aluno, turma e data para o relatorio de conferencia', () => {
    // Operacionais 8.3: o relatorio detalha aluno por aluno e aula por aula.
    const [item] = calcularFechamento([base]).itens
    expect(item.aluno_nome).toBe('João')
    expect(item.turma_nome).toBe('Matemática 9º ano')
    expect(item.data_aula).toBe('2026-08-04')
    expect(item.percentual_aplicado).toBe(60)
    expect(item.valor_servico).toBe(10000)
  })

  it('ordena por data para o relatorio', () => {
    const f = calcularFechamento([
      { ...base, presenca_id: 1, data_aula: '2026-08-20' },
      { ...base, presenca_id: 2, data_aula: '2026-08-04' },
    ])
    expect(f.itens.map((i) => i.data_aula)).toEqual(['2026-08-04', '2026-08-20'])
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `npm test -- pagamentos/fechamento`
Expected: FAIL — `Failed to resolve import "./fechamento"`

- [ ] **Step 3: Implementar**

`src/dominio/pagamentos/fechamento.ts`:
```ts
import { aplicarPercentual, somar, type Centavos } from '@/dominio/dinheiro'

export interface PresencaRemunerada {
  presenca_id: number
  aluno_id: number
  aluno_nome: string
  turma_id: number
  turma_nome: string
  data_aula: string
  presente: boolean
  flag_reposicao: boolean
  /** Valor do servico VIGENTE NA DATA DA AULA, em centavos. */
  valor_servico: Centavos
  /** Percentual do professor VIGENTE NA DATA DA AULA. Ex.: 60 para 60%. */
  percentual: number
  /** Ja incluida em outro fechamento. */
  ja_paga: boolean
}

export interface ItemFechamento {
  presenca_id: number
  aluno_id: number
  aluno_nome: string
  turma_id: number
  turma_nome: string
  data_aula: string
  valor_servico: Centavos
  percentual_aplicado: number
  valor_professor: Centavos
}

export interface Fechamento {
  itens: ItemFechamento[]
  valor_total: Centavos
}

/**
 * Modulos Operacionais 8.2. O pagamento e baseado exclusivamente em presencas
 * confirmadas: aula sem registro ou marcada como ausencia nao gera valor.
 *
 * Presenca em aula de reposicao conta normalmente para o professor que a
 * ministrou, mesmo que a reposicao tenha ocorrido em turma diferente da
 * original (RN 5.4).
 *
 * Valor e percentual chegam ja resolvidos para a data da aula: mudanca posterior
 * de preco ou de repasse nao reescreve o que ja foi fechado.
 */
export function calcularFechamento(presencas: PresencaRemunerada[]): Fechamento {
  const itens: ItemFechamento[] = presencas
    .filter((p) => p.presente && !p.ja_paga)
    .slice()
    .sort((a, b) => a.data_aula.localeCompare(b.data_aula))
    .map((p) => ({
      presenca_id: p.presenca_id,
      aluno_id: p.aluno_id,
      aluno_nome: p.aluno_nome,
      turma_id: p.turma_id,
      turma_nome: p.turma_nome,
      data_aula: p.data_aula,
      valor_servico: p.valor_servico,
      percentual_aplicado: p.percentual,
      valor_professor: aplicarPercentual(p.valor_servico, p.percentual),
    }))

  return { itens, valor_total: somar(...itens.map((i) => i.valor_professor)) }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test`
Expected: PASS, 14 arquivos, 128 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/pagamentos/
git commit -m "feat(dominio): fechamento de repasse por presenca confirmada"
```

---

### Task 7: Camada de dados — cobranças

**Files:**
- Create: `src/dados/cobrancas.ts`

- [ ] **Step 1: Implementar**

`src/dados/cobrancas.ts`:
```ts
import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, somar, type Centavos } from '@/dominio/dinheiro'
import { montarCobrancas, type AulaFaturavel } from '@/dominio/cobrancas/geracao'
import { gerarTextoCobranca, type ItemDoTexto } from '@/dominio/cobrancas/texto'

export interface CobrancaResumo {
  id: number
  responsavel_id: number
  mes_referencia: string
  valor_bruto: Centavos
  valor_desconto: Centavos
  valor_total: Centavos
  status: string
  texto_whatsapp: string | null
  responsavel: { id: number; nome: string; telefone: string | null } | null
  recebido: Centavos
}

/** Primeiro e último dia do mês, em ISO. */
export function limitesDoMes(mes: string): { primeiro: string; ultimo: string } {
  const [ano, m] = mes.split('-').map(Number)
  const ultimoDia = new Date(ano, m, 0).getDate()
  return { primeiro: `${mes}-01`, ultimo: `${mes}-${String(ultimoDia).padStart(2, '0')}` }
}

/**
 * Levanta as aulas do mês com tudo que a regra de faturamento precisa decidir.
 * O valor vem de `valor_servico_em`, resolvido para a data de cada aula — nunca
 * do valor corrente do serviço, que pode ter mudado desde então.
 */
async function aulasDoMes(mes: string): Promise<AulaFaturavel[]> {
  const supabase = await clienteServidor()
  const { primeiro, ultimo } = limitesDoMes(mes)

  const { data: aulas, error } = await supabase
    .from('aulas')
    .select(`
      id, data_hora_inicio, status, turma_id,
      turma:turmas!turma_id (
        id, nome, servico_id,
        servico:servicos!servico_id (id, nome),
        materia:materias!materia_id (nome),
        ano_escolar:anos_escolares!ano_escolar_id (nome)
      )
    `)
    .gte('data_hora_inicio', `${primeiro}T00:00:00`)
    .lte('data_hora_inicio', `${ultimo}T23:59:59`)

  if (error) throw new Error(`Falha ao carregar aulas: ${error.message}`)

  const linhas = (aulas ?? []) as unknown as {
    id: number
    data_hora_inicio: string
    status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Feriado'
    turma_id: number
    turma: {
      id: number
      nome: string
      servico_id: number
      servico: { id: number; nome: string } | null
      materia: { nome: string } | null
      ano_escolar: { nome: string } | null
    } | null
  }[]

  if (linhas.length === 0) return []

  const [{ data: matriculas }, { data: cobradas }] = await Promise.all([
    supabase
      .from('matriculas')
      .select('aluno_id, turma_id, status, flag_reposicao, data_inicio, data_fim, aluno:alunos!aluno_id (id, nome, responsavel_id, responsavel:responsaveis!responsavel_id (id, nome))'),
    supabase.from('itens_cobranca').select('aula_id'),
  ])

  const jaCobradas = new Set((cobradas ?? []).map((c) => c.aula_id))

  const mats = (matriculas ?? []) as unknown as {
    aluno_id: number
    turma_id: number
    status: string
    flag_reposicao: boolean
    data_inicio: string
    data_fim: string | null
    aluno: {
      id: number
      nome: string
      responsavel_id: number
      responsavel: { id: number; nome: string } | null
    } | null
  }[]

  // Valor vigente por serviço na data de cada aula, resolvido uma vez por par.
  const valores = new Map<string, Centavos>()
  for (const aula of linhas) {
    const dia = aula.data_hora_inicio.slice(0, 10)
    const servicoId = aula.turma?.servico_id
    if (!servicoId) continue
    const chave = `${servicoId}|${dia}`
    if (valores.has(chave)) continue
    const { data } = await supabase.rpc('valor_servico_em', {
      p_servico_id: servicoId,
      p_data: dia,
    })
    valores.set(chave, deNumeric(data ?? '0'))
  }

  const faturaveis: AulaFaturavel[] = []

  for (const aula of linhas) {
    const dia = aula.data_hora_inicio.slice(0, 10)
    const doTurma = mats.filter(
      (m) =>
        m.turma_id === aula.turma_id &&
        m.data_inicio <= dia &&
        (!m.data_fim || m.data_fim >= dia),
    )

    for (const m of doTurma) {
      if (!m.aluno?.responsavel) continue
      const partes = [
        aula.turma?.materia?.nome,
        aula.turma?.ano_escolar?.nome,
        aula.turma?.servico?.nome,
      ].filter(Boolean)

      faturaveis.push({
        aula_id: aula.id,
        aluno_id: m.aluno_id,
        aluno_nome: m.aluno.nome,
        responsavel_id: m.aluno.responsavel.id,
        responsavel_nome: m.aluno.responsavel.nome,
        data: dia,
        descricao: partes.join(' — '),
        valor: valores.get(`${aula.turma?.servico_id}|${dia}`) ?? 0,
        status_aula: aula.status,
        matricula_ativa: m.status === 'Ativa',
        matricula_reposicao: m.flag_reposicao,
        ja_cobrada: jaCobradas.has(aula.id),
      })
    }
  }

  return faturaveis
}

/**
 * Gera as cobranças do mês em Rascunho, para a gestora revisar.
 * Reprocessar o mesmo mês não duplica item: aulas já cobradas são ignoradas na
 * montagem, e `UNIQUE(itens_cobranca.aula_id)` fecha a porta no banco.
 */
export async function gerarCobrancasDoMes(
  mes: string,
): Promise<{ criadas: number; itens: number }> {
  const supabase = await clienteServidor()
  const montadas = montarCobrancas(await aulasDoMes(mes))
  const { primeiro } = limitesDoMes(mes)

  let criadas = 0
  let itens = 0

  for (const c of montadas) {
    // Reaproveita o rascunho do mês se já existir; senão cria.
    const { data: existente } = await supabase
      .from('cobrancas')
      .select('id, status')
      .eq('responsavel_id', c.responsavel_id)
      .eq('mes_referencia', primeiro)
      .maybeSingle()

    if (existente && existente.status !== 'Rascunho') continue

    let cobrancaId = existente?.id
    if (!cobrancaId) {
      const { data, error } = await supabase
        .from('cobrancas')
        .insert({
          responsavel_id: c.responsavel_id,
          mes_referencia: primeiro,
          valor_bruto: paraNumeric(c.valor_bruto),
          valor_desconto: paraNumeric(c.valor_desconto),
          valor_total: paraNumeric(c.valor_total),
        })
        .select('id')
        .single()
      if (error) throw new Error(`Falha ao criar cobrança: ${error.message}`)
      cobrancaId = data.id
      criadas++
    }

    const { error: erroItens } = await supabase.from('itens_cobranca').insert(
      c.itens.map((i) => ({
        cobranca_id: cobrancaId,
        aluno_id: i.aluno_id,
        aula_id: i.aula_id,
        descricao: i.descricao,
        valor_original: paraNumeric(i.valor_original),
        desconto: paraNumeric(i.desconto),
        valor_final: paraNumeric(i.valor_final),
      })),
    )
    if (erroItens) throw new Error(`Falha ao gravar itens: ${erroItens.message}`)
    itens += c.itens.length

    await recalcularTotais(cobrancaId)
  }

  return { criadas, itens }
}

/** Recalcula os totais a partir dos itens. Chamar após qualquer ajuste. */
export async function recalcularTotais(cobrancaId: number): Promise<void> {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('itens_cobranca')
    .select('valor_original, desconto, valor_final')
    .eq('cobranca_id', cobrancaId)

  const bruto = somar(...(data ?? []).map((i) => deNumeric(i.valor_original)))
  const desconto = somar(...(data ?? []).map((i) => deNumeric(i.desconto)))

  await supabase
    .from('cobrancas')
    .update({
      valor_bruto: paraNumeric(bruto),
      valor_desconto: paraNumeric(desconto),
      valor_total: paraNumeric(bruto - desconto),
    })
    .eq('id', cobrancaId)
}

export async function listarCobrancas(filtros: { mes?: string; status?: string } = {}) {
  const supabase = await clienteServidor()
  let consulta = supabase
    .from('cobrancas')
    .select('id, responsavel_id, mes_referencia, valor_bruto, valor_desconto, valor_total, status, texto_whatsapp, responsavel:responsaveis!responsavel_id (id, nome, telefone)')

  if (filtros.mes) consulta = consulta.eq('mes_referencia', `${filtros.mes}-01`)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)

  const { data, error } = await consulta.order('mes_referencia', { ascending: false })
  if (error) throw new Error(`Falha ao listar cobranças: ${error.message}`)

  const linhas = (data ?? []) as unknown as {
    id: number
    responsavel_id: number
    mes_referencia: string
    valor_bruto: string
    valor_desconto: string
    valor_total: string
    status: string
    texto_whatsapp: string | null
    responsavel: { id: number; nome: string; telefone: string | null } | null
  }[]

  const { data: recebimentos } = await supabase.from('recebimentos').select('cobranca_id, valor_recebido')
  const recebidoPor = new Map<number, Centavos>()
  for (const r of recebimentos ?? []) {
    recebidoPor.set(r.cobranca_id, somar(recebidoPor.get(r.cobranca_id) ?? 0, deNumeric(r.valor_recebido)))
  }

  return linhas.map((c) => ({
    ...c,
    valor_bruto: deNumeric(c.valor_bruto),
    valor_desconto: deNumeric(c.valor_desconto),
    valor_total: deNumeric(c.valor_total),
    recebido: recebidoPor.get(c.id) ?? 0,
  })) as CobrancaResumo[]
}

export async function obterCobranca(id: number) {
  const supabase = await clienteServidor()
  const { data: cobranca } = await supabase
    .from('cobrancas')
    .select('id, responsavel_id, mes_referencia, valor_bruto, valor_desconto, valor_total, status, texto_whatsapp, responsavel:responsaveis!responsavel_id (id, nome, telefone)')
    .eq('id', id)
    .maybeSingle()

  if (!cobranca) return null

  const { data: itens } = await supabase
    .from('itens_cobranca')
    .select('id, aluno_id, aula_id, descricao, valor_original, desconto, valor_final, aluno:alunos!aluno_id (nome), aula:aulas!aula_id (data_hora_inicio)')
    .eq('cobranca_id', id)

  const c = cobranca as unknown as {
    id: number
    responsavel_id: number
    mes_referencia: string
    valor_bruto: string
    valor_desconto: string
    valor_total: string
    status: string
    texto_whatsapp: string | null
    responsavel: { id: number; nome: string; telefone: string | null } | null
  }

  return {
    ...c,
    valor_bruto: deNumeric(c.valor_bruto),
    valor_desconto: deNumeric(c.valor_desconto),
    valor_total: deNumeric(c.valor_total),
    itens: ((itens ?? []) as unknown as {
      id: number
      aluno_id: number
      aula_id: number
      descricao: string
      valor_original: string
      desconto: string
      valor_final: string
      aluno: { nome: string } | null
      aula: { data_hora_inicio: string } | null
    }[]).map((i) => ({
      ...i,
      valor_original: deNumeric(i.valor_original),
      desconto: deNumeric(i.desconto),
      valor_final: deNumeric(i.valor_final),
      data: i.aula?.data_hora_inicio.slice(0, 10) ?? '',
    })),
  }
}

export async function ajustarDesconto(itemId: number, desconto: Centavos): Promise<void> {
  const supabase = await clienteServidor()
  const { data: item } = await supabase
    .from('itens_cobranca')
    .select('cobranca_id, valor_original')
    .eq('id', itemId)
    .maybeSingle()

  if (!item) throw new Error('Item não encontrado.')

  const original = deNumeric(item.valor_original)
  if (desconto < 0 || desconto > original) {
    throw new Error('O desconto não pode ser negativo nem maior que o valor da aula.')
  }

  await supabase
    .from('itens_cobranca')
    .update({ desconto: paraNumeric(desconto), valor_final: paraNumeric(original - desconto) })
    .eq('id', itemId)

  await recalcularTotais(item.cobranca_id)
}

/** Confirma a cobrança e gera o texto do WhatsApp (Operacionais 6.3). */
export async function confirmarCobranca(id: number, usuario: string): Promise<void> {
  const supabase = await clienteServidor()
  const cobranca = await obterCobranca(id)
  if (!cobranca) throw new Error('Cobrança não encontrada.')

  const { data: conta } = await supabase
    .from('contas')
    .select('chave_pix')
    .not('chave_pix', 'is', null)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  const [ano, mes] = cobranca.mes_referencia.split('-')
  const itensTexto: ItemDoTexto[] = cobranca.itens.map((i) => ({
    aluno_nome: i.aluno?.nome ?? 'Aluno',
    contexto: i.descricao.split(' — ').slice(0, 2).join(' — '),
    descricao: i.descricao.split(' — ').slice(-1)[0],
    data: i.data,
    valor_final: i.valor_final,
  }))

  const texto = gerarTextoCobranca({
    responsavel_nome: cobranca.responsavel?.nome ?? '',
    mes_referencia: cobranca.mes_referencia,
    valor_total: cobranca.valor_total,
    chave_pix: conta?.chave_pix ?? null,
    vencimento: `${ano}-${mes}-05`,
    itens: itensTexto,
  })

  await supabase
    .from('cobrancas')
    .update({ status: 'Confirmada', texto_whatsapp: texto })
    .eq('id', id)

  await supabase.from('logs_operacionais').insert({
    acao: 'confirmar_cobranca',
    entidade: 'cobrancas',
    entidade_id: id,
    usuario,
    detalhe: { valor_total: cobranca.valor_total, itens: cobranca.itens.length },
  })
}

export async function marcarComoEnviada(id: number): Promise<void> {
  const supabase = await clienteServidor()
  await supabase.from('cobrancas').update({ status: 'Enviada' }).eq('id', id)
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros. Se aparecer TS2352 em join, use `as unknown as Tipo[]`.

```bash
git add src/dados/cobrancas.ts
git commit -m "feat(dados): geracao, ajuste e confirmacao de cobranca"
```

---

### Task 8: Camada de dados — recebimentos e pagamentos

**Files:**
- Create: `src/dados/recebimentos.ts`, `src/dados/pagamentos.ts`

- [ ] **Step 1: Recebimentos**

`src/dados/recebimentos.ts`:
```ts
import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import { saldoEStatus, validarRecebimento, type StatusCobranca } from '@/dominio/recebimentos/quitacao'

export async function registrarRecebimento(entrada: {
  cobrancaId: number
  valor: Centavos
  data: string
  contaId: number | null
  formaPagamento: string | null
  observacao: string | null
  usuario: string
}): Promise<{ ok: boolean; erros?: string[]; saldo?: Centavos }> {
  const supabase = await clienteServidor()

  const { data: cobranca } = await supabase
    .from('cobrancas')
    .select('id, valor_total, status')
    .eq('id', entrada.cobrancaId)
    .maybeSingle()

  if (!cobranca) return { ok: false, erros: ['Cobrança não encontrada.'] }

  const { data: anteriores } = await supabase
    .from('recebimentos')
    .select('valor_recebido')
    .eq('cobranca_id', entrada.cobrancaId)

  const total = deNumeric(cobranca.valor_total)
  const jaRecebidos = (anteriores ?? []).map((r) => deNumeric(r.valor_recebido))
  const { saldo } = saldoEStatus(total, jaRecebidos, cobranca.status as StatusCobranca)

  const erros = validarRecebimento(entrada.valor, saldo, entrada.contaId)
  if (erros.length > 0) return { ok: false, erros }

  const { error } = await supabase.from('recebimentos').insert({
    cobranca_id: entrada.cobrancaId,
    valor_recebido: paraNumeric(entrada.valor),
    data_recebimento: entrada.data,
    conta_id: entrada.contaId,
    forma_pagamento: entrada.formaPagamento,
    observacao: entrada.observacao,
    registrado_por: entrada.usuario,
  })

  if (error) return { ok: false, erros: [error.message] }

  const novo = saldoEStatus(total, [...jaRecebidos, entrada.valor], cobranca.status as StatusCobranca)
  await supabase.from('cobrancas').update({ status: novo.status }).eq('id', entrada.cobrancaId)

  await supabase.from('logs_operacionais').insert({
    acao: 'registrar_recebimento',
    entidade: 'cobrancas',
    entidade_id: entrada.cobrancaId,
    usuario: entrada.usuario,
    detalhe: { valor: entrada.valor, saldo_restante: novo.saldo, status: novo.status },
  })

  return { ok: true, saldo: novo.saldo }
}

export async function recebimentosDaCobranca(cobrancaId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('recebimentos')
    .select('id, valor_recebido, data_recebimento, forma_pagamento, observacao, conta:contas!conta_id (nome)')
    .eq('cobranca_id', cobrancaId)
    .order('data_recebimento')

  return ((data ?? []) as unknown as {
    id: number
    valor_recebido: string
    data_recebimento: string
    forma_pagamento: string | null
    observacao: string | null
    conta: { nome: string } | null
  }[]).map((r) => ({ ...r, valor_recebido: deNumeric(r.valor_recebido) }))
}
```

- [ ] **Step 2: Pagamentos**

`src/dados/pagamentos.ts`:
```ts
import 'server-only'
import { clienteServidor } from './cliente'
import { deNumeric, paraNumeric, type Centavos } from '@/dominio/dinheiro'
import { calcularFechamento, type PresencaRemunerada } from '@/dominio/pagamentos/fechamento'

/**
 * Levanta as presenças confirmadas do professor no período, com o valor do
 * serviço e o percentual VIGENTES NA DATA DE CADA AULA.
 */
export async function previaFechamento(professorId: number, de: string, ate: string) {
  const supabase = await clienteServidor()

  const { data: presencas } = await supabase
    .from('presencas')
    .select(`
      id, presente, flag_reposicao, aluno_id,
      aluno:alunos!aluno_id (nome),
      aula:aulas!aula_id (
        id, data_hora_inicio, turma_id,
        turma:turmas!turma_id (id, nome, servico_id, professor_id)
      )
    `)
    .eq('presente', true)

  const linhas = ((presencas ?? []) as unknown as {
    id: number
    presente: boolean
    flag_reposicao: boolean
    aluno_id: number
    aluno: { nome: string } | null
    aula: {
      id: number
      data_hora_inicio: string
      turma_id: number
      turma: { id: number; nome: string; servico_id: number; professor_id: number } | null
    } | null
  }[]).filter((p) => {
    const dia = p.aula?.data_hora_inicio.slice(0, 10) ?? ''
    return p.aula?.turma?.professor_id === professorId && dia >= de && dia <= ate
  })

  const { data: jaPagas } = await supabase.from('itens_conta_pagar_professor').select('presenca_id')
  const pagas = new Set((jaPagas ?? []).map((i) => i.presenca_id))

  const remuneradas: PresencaRemunerada[] = []
  for (const p of linhas) {
    const dia = p.aula!.data_hora_inicio.slice(0, 10)
    const [{ data: valor }, { data: percentual }] = await Promise.all([
      supabase.rpc('valor_servico_em', { p_servico_id: p.aula!.turma!.servico_id, p_data: dia }),
      supabase.rpc('percentual_professor_em', { p_professor_id: professorId, p_data: dia }),
    ])

    remuneradas.push({
      presenca_id: p.id,
      aluno_id: p.aluno_id,
      aluno_nome: p.aluno?.nome ?? 'Aluno',
      turma_id: p.aula!.turma!.id,
      turma_nome: p.aula!.turma!.nome,
      data_aula: dia,
      presente: true,
      flag_reposicao: p.flag_reposicao,
      valor_servico: deNumeric(valor ?? '0'),
      percentual: Number(percentual ?? 0),
      ja_paga: pagas.has(p.id),
    })
  }

  return calcularFechamento(remuneradas)
}

export async function gerarContaPagar(
  professorId: number,
  de: string,
  ate: string,
  usuario: string,
): Promise<{ ok: boolean; erros?: string[]; id?: number; valor?: Centavos }> {
  const supabase = await clienteServidor()
  const fechamento = await previaFechamento(professorId, de, ate)

  if (fechamento.itens.length === 0) {
    return { ok: false, erros: ['Nenhuma presença confirmada e ainda não paga neste período.'] }
  }

  const { data: conta, error } = await supabase
    .from('contas_pagar_professor')
    .insert({
      professor_id: professorId,
      periodo_inicio: de,
      periodo_fim: ate,
      valor_total: paraNumeric(fechamento.valor_total),
    })
    .select('id')
    .single()

  if (error) return { ok: false, erros: [error.message] }

  const { error: erroItens } = await supabase.from('itens_conta_pagar_professor').insert(
    fechamento.itens.map((i) => ({
      conta_pagar_id: conta.id,
      presenca_id: i.presenca_id,
      aluno_id: i.aluno_id,
      turma_id: i.turma_id,
      data_aula: i.data_aula,
      valor_servico: paraNumeric(i.valor_servico),
      percentual_aplicado: i.percentual_aplicado,
      valor_professor: paraNumeric(i.valor_professor),
    })),
  )

  if (erroItens) {
    await supabase.from('contas_pagar_professor').delete().eq('id', conta.id)
    return { ok: false, erros: [erroItens.message] }
  }

  await supabase.from('logs_operacionais').insert({
    acao: 'gerar_conta_pagar',
    entidade: 'contas_pagar_professor',
    entidade_id: conta.id,
    usuario,
    detalhe: { professor_id: professorId, periodo: `${de} a ${ate}`, valor: fechamento.valor_total },
  })

  return { ok: true, id: conta.id, valor: fechamento.valor_total }
}

export async function listarContasPagar(filtros: { professorId?: number; status?: string } = {}) {
  const supabase = await clienteServidor()
  let consulta = supabase
    .from('contas_pagar_professor')
    .select('id, professor_id, periodo_inicio, periodo_fim, valor_total, status, data_pagamento, professor:professores!professor_id (id, nome)')

  if (filtros.professorId) consulta = consulta.eq('professor_id', filtros.professorId)
  if (filtros.status) consulta = consulta.eq('status', filtros.status)

  const { data } = await consulta.order('periodo_inicio', { ascending: false })

  return ((data ?? []) as unknown as {
    id: number
    professor_id: number
    periodo_inicio: string
    periodo_fim: string
    valor_total: string
    status: string
    data_pagamento: string | null
    professor: { id: number; nome: string } | null
  }[]).map((c) => ({ ...c, valor_total: deNumeric(c.valor_total) }))
}

export async function darBaixaPagamento(
  contaId: number,
  data: string,
  contaOrigemId: number,
  usuario: string,
): Promise<void> {
  const supabase = await clienteServidor()
  const { error } = await supabase
    .from('contas_pagar_professor')
    .update({ status: 'Pago', data_pagamento: data, conta_id: contaOrigemId })
    .eq('id', contaId)

  if (error) throw new Error(error.message)

  await supabase.from('logs_operacionais').insert({
    acao: 'pagar_professor',
    entidade: 'contas_pagar_professor',
    entidade_id: contaId,
    usuario,
    detalhe: { data_pagamento: data, conta_id: contaOrigemId },
  })
}

/** Relatório detalhado do fechamento, para conferência do professor (§8.3). */
export async function relatorioFechamento(contaId: number) {
  const supabase = await clienteServidor()
  const { data } = await supabase
    .from('itens_conta_pagar_professor')
    .select('id, data_aula, valor_servico, percentual_aplicado, valor_professor, aluno:alunos!aluno_id (nome), turma:turmas!turma_id (nome)')
    .eq('conta_pagar_id', contaId)
    .order('data_aula')

  return ((data ?? []) as unknown as {
    id: number
    data_aula: string
    valor_servico: string
    percentual_aplicado: string
    valor_professor: string
    aluno: { nome: string } | null
    turma: { nome: string } | null
  }[]).map((i) => ({
    ...i,
    valor_servico: deNumeric(i.valor_servico),
    valor_professor: deNumeric(i.valor_professor),
    percentual_aplicado: Number(i.percentual_aplicado),
  }))
}
```

- [ ] **Step 3: Verificar e commitar**

```bash
npx tsc --noEmit
git add src/dados/recebimentos.ts src/dados/pagamentos.ts
git commit -m "feat(dados): recebimentos com saldo e fechamento de professor"
```

---

### Task 9: Provar a idempotência da cobrança contra o banco real

A garantia que mais importa deste plano. O teste unitário prova a regra; isto prova o sistema.

- [ ] **Step 1: Gerar as cobranças de agosto**

Crie um script temporário em `scripts/` (apague ao final) que use a service role key e:

1. Conte `cobrancas` e `itens_cobranca` antes
2. Chame a geração — como `gerarCobrancasDoMes` é `server-only`, replique a lógica no script ou exponha uma rota temporária; o mais simples é reproduzir a montagem usando `montarCobrancas` importado de `src/dominio/cobrancas/geracao.ts` via `npx tsx`
3. Conte de novo
4. **Rode a geração uma segunda vez** e conte outra vez

Expected: a primeira execução cria N cobranças e M itens; **a segunda não cria nenhum item novo**, e as contagens ficam idênticas.

- [ ] **Step 2: Provar a garantia estrutural do banco**

Tente inserir manualmente um `itens_cobranca` com um `aula_id` que já está em outro item:

```
node scripts/consultar.mjs itens_cobranca "id,cobranca_id,aula_id,valor_final"
```
Depois, no script temporário, tente o insert duplicado e reporte o erro. **Deve falhar** com violação de constraint única em `aula_id`. A falha aqui é o comportamento correto — é a idempotência garantida pelo Postgres, não pela aplicação.

- [ ] **Step 3: Conferir os valores**

```bash
node scripts/consultar.mjs cobrancas "id,responsavel_id,mes_referencia,valor_bruto,valor_total,status"
```
Expected: uma cobrança por responsável com aulas no mês, em `Rascunho`, com `valor_total` = soma dos itens. Confira à mão que o valor bate com (número de aulas × valor do serviço).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: prova de idempotencia da geracao de cobranca"
```

---

### Task 10: Telas de cobrança

**Files:**
- Create: `src/app/(app)/cobrancas/page.tsx`, `acoes.ts`, `PainelGeracao.tsx`, `[id]/page.tsx`, `[id]/EditorItens.tsx`

- [ ] **Step 1: Ações**

`src/app/(app)/cobrancas/acoes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import {
  ajustarDesconto,
  confirmarCobranca,
  gerarCobrancasDoMes,
  marcarComoEnviada,
} from '@/dados/cobrancas'
import { exigirGestora } from '@/dados/sessao'
import { deReal } from '@/dominio/dinheiro'

export async function gerar(mes: string) {
  await exigirGestora()
  const r = await gerarCobrancasDoMes(mes)
  revalidatePath('/cobrancas')
  return r
}

export async function salvarDesconto(itemId: number, cobrancaId: number, valorTexto: string) {
  await exigirGestora()
  try {
    await ajustarDesconto(itemId, deReal(valorTexto || '0'))
    revalidatePath(`/cobrancas/${cobrancaId}`)
    return { ok: true }
  } catch (erro) {
    return { ok: false, erro: erro instanceof Error ? erro.message : 'Falha ao ajustar.' }
  }
}

export async function confirmar(cobrancaId: number) {
  const sessao = await exigirGestora()
  await confirmarCobranca(cobrancaId, sessao.nome)
  revalidatePath(`/cobrancas/${cobrancaId}`)
  revalidatePath('/cobrancas')
}

export async function marcarEnviada(cobrancaId: number) {
  await exigirGestora()
  await marcarComoEnviada(cobrancaId)
  revalidatePath(`/cobrancas/${cobrancaId}`)
}
```

- [ ] **Step 2: Painel de geração**

`src/app/(app)/cobrancas/PainelGeracao.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { gerar } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'

export function PainelGeracao({ mesInicial }: { mesInicial: string }) {
  const router = useRouter()
  const [mes, setMes] = useState(mesInicial)
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<string | null>(null)

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Gerar cobranças do mês</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Cria uma cobrança por responsável, juntando todos os filhos e todas as turmas. Fica em
          rascunho para você revisar antes de confirmar. Rodar de novo não duplica nada.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Mês de referência">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={`${entradaClasse} max-w-[12rem]`}
          />
        </Campo>

        <Botao
          type="button"
          disabled={pendente || !mes}
          onClick={() =>
            iniciar(async () => {
              const r = await gerar(mes)
              setResultado(
                r.itens === 0
                  ? 'Nada novo a cobrar neste mês — tudo já estava cobrado.'
                  : `${r.criadas} cobrança(s) criada(s) com ${r.itens} aula(s).`,
              )
              router.refresh()
            })
          }
        >
          {pendente ? 'Gerando…' : 'Gerar cobranças'}
        </Botao>
      </div>

      {resultado && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-campo bg-apoio-suave px-4 py-3 text-apoio"
        >
          {resultado}
        </motion.p>
      )}
    </Cartao>
  )
}
```

- [ ] **Step 3: Listagem**

`src/app/(app)/cobrancas/page.tsx`:
```tsx
import Link from 'next/link'
import { listarCobrancas } from '@/dados/cobrancas'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { PainelGeracao } from './PainelGeracao'

const TOM: Record<string, 'ativo' | 'encerrado' | 'alerta' | 'neutro'> = {
  Rascunho: 'encerrado',
  Confirmada: 'neutro',
  Enviada: 'neutro',
  Parcial: 'alerta',
  Quitada: 'ativo',
}

export default async function PaginaCobrancas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  await exigirGestora()
  const { mes } = await searchParams
  const agora = new Date()
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`

  const cobrancas = await listarCobrancas(mes ? { mes } : {})
  const total = cobrancas.reduce((s, c) => s + c.valor_total, 0)
  const recebido = cobrancas.reduce((s, c) => s + c.recebido, 0)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Cobranças</h1>
        <p className="mt-1 text-tinta-suave">
          {cobrancas.length} cobrança(s) · {formatarBRL(total)} no total ·{' '}
          {formatarBRL(recebido)} recebido
        </p>
      </header>

      <PainelGeracao mesInicial={mes ?? mesAtual} />

      {cobrancas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma cobrança ainda"
          descricao="Escolha o mês acima e gere as cobranças. O sistema junta as aulas previstas de cada responsável, agrupando todos os filhos."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {cobrancas.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cobrancas/${c.id}`}
                className="block rounded-cartao border border-borda bg-superficie p-5 transition-all hover:-translate-y-0.5 hover:border-destaque/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.responsavel?.nome}</p>
                    <p className="mt-1 text-sm text-tinta-suave">
                      {c.mes_referencia.slice(0, 7).split('-').reverse().join('/')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-titulo text-xl">{formatarBRL(c.valor_total)}</p>
                    {c.recebido > 0 && c.recebido < c.valor_total && (
                      <p className="text-sm text-alerta">
                        falta {formatarBRL(c.valor_total - c.recebido)}
                      </p>
                    )}
                    <div className="mt-1">
                      <Selo tom={TOM[c.status]}>{c.status}</Selo>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Detalhe com editor de descontos e texto do WhatsApp**

`src/app/(app)/cobrancas/[id]/EditorItens.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { confirmar, marcarEnviada, salvarDesconto } from '../acoes'
import { Botao } from '@/ui/Botao'
import { entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'

interface Item {
  id: number
  aluno_nome: string
  descricao: string
  data: string
  valor_original: number
  desconto: number
  valor_final: number
}

export function EditorItens({
  cobrancaId,
  itens,
  status,
  texto,
}: {
  cobrancaId: number
  itens: Item[]
  status: string
  texto: string | null
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const editavel = status === 'Rascunho'

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-borda bg-superficie-2/60 text-sm text-tinta-suave">
              <th className="px-5 py-3 font-semibold">Aluno</th>
              <th className="px-5 py-3 font-semibold">Aula</th>
              <th className="px-5 py-3 font-semibold">Valor</th>
              <th className="px-5 py-3 font-semibold">Desconto</th>
              <th className="px-5 py-3 font-semibold">Final</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-b border-borda/60 last:border-0">
                <td className="px-5 py-3">{i.aluno_nome}</td>
                <td className="px-5 py-3 text-sm text-tinta-suave">
                  {i.data.split('-').reverse().join('/')} · {i.descricao}
                </td>
                <td className="px-5 py-3">{formatarBRL(i.valor_original)}</td>
                <td className="px-5 py-3">
                  {editavel ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={(i.desconto / 100).toFixed(2).replace('.', ',')}
                      aria-label={`Desconto para ${i.aluno_nome}`}
                      onBlur={(e) =>
                        iniciar(async () => {
                          const r = await salvarDesconto(i.id, cobrancaId, e.target.value)
                          if (!r.ok) setErro(r.erro ?? 'Falha ao ajustar.')
                          else router.refresh()
                        })
                      }
                      className={`${entradaClasse} max-w-[7rem]`}
                    />
                  ) : (
                    formatarBRL(i.desconto)
                  )}
                </td>
                <td className="px-5 py-3 font-medium">{formatarBRL(i.valor_final)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erro}
        </p>
      )}

      {editavel && (
        <Botao
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              await confirmar(cobrancaId)
              router.refresh()
            })
          }
        >
          Confirmar cobrança e gerar o texto
        </Botao>
      )}

      {texto && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg">Texto para o WhatsApp</h2>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-cartao border border-borda bg-superficie-2 p-5 font-mono text-sm">
            {texto}
          </pre>
          <div className="flex flex-wrap gap-3">
            <Botao
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(texto)
                setCopiado(true)
                setTimeout(() => setCopiado(false), 2500)
              }}
            >
              {copiado ? 'Copiado!' : 'Copiar texto'}
            </Botao>
            {status === 'Confirmada' && (
              <Botao
                type="button"
                aparencia="secundario"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    await marcarEnviada(cobrancaId)
                    router.refresh()
                  })
                }
              >
                Já enviei pelo WhatsApp
              </Botao>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

`src/app/(app)/cobrancas/[id]/page.tsx`:
```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterCobranca } from '@/dados/cobrancas'
import { recebimentosDaCobranca } from '@/dados/recebimentos'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { BotaoLink } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'
import { EditorItens } from './EditorItens'

export default async function PaginaCobranca({ params }: { params: Promise<{ id: string }> }) {
  await exigirGestora()
  const { id } = await params
  const cobranca = await obterCobranca(Number(id))
  if (!cobranca) notFound()

  const recebimentos = await recebimentosDaCobranca(cobranca.id)
  const recebido = recebimentos.reduce((s, r) => s + r.valor_recebido, 0)
  const saldo = Math.max(0, cobranca.valor_total - recebido)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">{cobranca.responsavel?.nome}</h1>
          <p className="mt-1 text-tinta-suave">
            {cobranca.mes_referencia.slice(0, 7).split('-').reverse().join('/')}
          </p>
        </div>
        <Selo>{cobranca.status}</Selo>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Cartao>
          <p className="text-sm text-tinta-suave">Total</p>
          <p className="font-titulo text-2xl">{formatarBRL(cobranca.valor_total)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-tinta-suave">Recebido</p>
          <p className="font-titulo text-2xl text-apoio">{formatarBRL(recebido)}</p>
        </Cartao>
        <Cartao>
          <p className="text-sm text-tinta-suave">Em aberto</p>
          <p className={`font-titulo text-2xl ${saldo > 0 ? 'text-alerta' : 'text-apoio'}`}>
            {formatarBRL(saldo)}
          </p>
        </Cartao>
      </div>

      <EditorItens
        cobrancaId={cobranca.id}
        status={cobranca.status}
        texto={cobranca.texto_whatsapp}
        itens={cobranca.itens.map((i) => ({
          id: i.id,
          aluno_nome: i.aluno?.nome ?? 'Aluno',
          descricao: i.descricao,
          data: i.data,
          valor_original: i.valor_original,
          desconto: i.desconto,
          valor_final: i.valor_final,
        }))}
      />

      {saldo > 0 && cobranca.status !== 'Rascunho' && (
        <BotaoLink href={`/recebimentos?cobranca=${cobranca.id}`}>Registrar recebimento</BotaoLink>
      )}

      {recebimentos.length > 0 && (
        <Cartao>
          <h2 className="mb-3 text-lg">Recebimentos</h2>
          <ul className="divide-y divide-borda/60">
            {recebimentos.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <span>
                  {r.data_recebimento.split('-').reverse().join('/')}
                  <span className="ml-2 text-sm text-tinta-suave">
                    {r.forma_pagamento ?? ''} {r.conta?.nome ? `· ${r.conta.nome}` : ''}
                  </span>
                </span>
                <span className="font-medium">{formatarBRL(r.valor_recebido)}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Link href="/cobrancas" className="text-destaque hover:underline">
        ← Voltar para as cobranças
      </Link>
    </div>
  )
}
```

- [ ] **Step 5: Verificar e commitar**

**Atenção:** `EditorItens.tsx` recebe apenas dados serializáveis (números e strings). Nunca passe a cobrança inteira do servidor com objetos ricos dentro.

```bash
npm run build && npx tsc --noEmit
git add "src/app/(app)/cobrancas/"
git commit -m "feat(cobrancas): geracao mensal, ajuste de desconto e texto do WhatsApp"
```

---

### Task 11: Telas de recebimento e pagamento

**Files:**
- Create: `src/app/(app)/recebimentos/page.tsx`, `acoes.ts`, `FormularioBaixa.tsx`
- Create: `src/app/(app)/pagamentos/page.tsx`, `acoes.ts`, `PainelFechamento.tsx`

- [ ] **Step 1: Recebimentos — ação e formulário**

`src/app/(app)/recebimentos/acoes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { registrarRecebimento } from '@/dados/recebimentos'
import { exigirGestora } from '@/dados/sessao'
import { deReal } from '@/dominio/dinheiro'

export async function darBaixa(entrada: {
  cobrancaId: number
  valorTexto: string
  data: string
  contaId: number | null
  formaPagamento: string | null
  observacao: string | null
}) {
  const sessao = await exigirGestora()

  let valor: number
  try {
    valor = deReal(entrada.valorTexto)
  } catch {
    return { ok: false, erros: ['Valor inválido. Use o formato 1.234,56.'] }
  }

  const r = await registrarRecebimento({
    cobrancaId: entrada.cobrancaId,
    valor,
    data: entrada.data,
    contaId: entrada.contaId,
    formaPagamento: entrada.formaPagamento,
    observacao: entrada.observacao,
    usuario: sessao.nome,
  })

  revalidatePath('/recebimentos')
  revalidatePath(`/cobrancas/${entrada.cobrancaId}`)
  return r
}
```

`src/app/(app)/recebimentos/FormularioBaixa.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { darBaixa } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { formatarBRL } from '@/dominio/dinheiro'

const FORMAS = ['Pix', 'Dinheiro', 'Transferência', 'Cartão', 'Outros']

export function FormularioBaixa({
  cobrancaId,
  responsavel,
  saldo,
  contas,
}: {
  cobrancaId: number
  responsavel: string
  saldo: number
  contas: { id: number; nome: string }[]
}) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [erros, setErros] = useState<string[]>([])
  // Pre-preenchido com o saldo, editavel para pagamento parcial (Operacionais 7.4).
  const [valor, setValor] = useState((saldo / 100).toFixed(2).replace('.', ','))
  const [data, setData] = useState(new Date().toISOString().slice(0, 10))
  const [contaId, setContaId] = useState<number | null>(contas[0]?.id ?? null)
  const [forma, setForma] = useState('Pix')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setErros([])
        iniciar(async () => {
          const r = await darBaixa({
            cobrancaId,
            valorTexto: valor,
            data,
            contaId,
            formaPagamento: forma,
            observacao: null,
          })
          if (r.ok) router.refresh()
          else setErros(r.erros ?? ['Não foi possível registrar.'])
        })
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-tinta-suave">
        {responsavel} · saldo em aberto de <strong>{formatarBRL(saldo)}</strong>
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Valor recebido" ajuda="Pode ser menor que o saldo, para pagamento parcial." obrigatorio>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className={entradaClasse} />
        </Campo>
        <Campo etiqueta="Data" obrigatorio>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={entradaClasse} />
        </Campo>
        <Campo etiqueta="Conta de destino" obrigatorio>
          <select
            value={contaId ?? ''}
            onChange={(e) => setContaId(e.target.value ? Number(e.target.value) : null)}
            className={entradaClasse}
          >
            <option value="">Selecione…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Forma de pagamento">
          <select value={forma} onChange={(e) => setForma(e.target.value)} className={entradaClasse}>
            {FORMAS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Campo>
      </div>

      {erros.length > 0 && (
        <ul role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <Botao type="submit" disabled={pendente}>
        {pendente ? 'Registrando…' : 'Registrar recebimento'}
      </Botao>
    </form>
  )
}
```

`src/app/(app)/recebimentos/page.tsx`:
```tsx
import Link from 'next/link'
import { listarCobrancas } from '@/dados/cobrancas'
import { clienteServidor } from '@/dados/cliente'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { FormularioBaixa } from './FormularioBaixa'

export default async function PaginaRecebimentos({
  searchParams,
}: {
  searchParams: Promise<{ cobranca?: string }>
}) {
  await exigirGestora()
  const { cobranca } = await searchParams

  const supabase = await clienteServidor()
  const [todas, { data: contas }] = await Promise.all([
    listarCobrancas(),
    supabase.from('contas').select('id, nome').eq('ativo', true).order('nome'),
  ])

  const emAberto = todas.filter(
    (c) => c.status !== 'Rascunho' && c.valor_total - c.recebido > 0,
  )
  const selecionada = cobranca ? emAberto.find((c) => c.id === Number(cobranca)) : undefined

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Recebimentos</h1>
        <p className="mt-1 text-tinta-suave">
          {emAberto.length} cobrança(s) em aberto ·{' '}
          {formatarBRL(emAberto.reduce((s, c) => s + (c.valor_total - c.recebido), 0))} a receber
        </p>
      </header>

      {selecionada && (
        <Cartao>
          <h2 className="mb-3 text-lg">Registrar recebimento</h2>
          <FormularioBaixa
            cobrancaId={selecionada.id}
            responsavel={selecionada.responsavel?.nome ?? ''}
            saldo={selecionada.valor_total - selecionada.recebido}
            contas={contas ?? []}
          />
        </Cartao>
      )}

      {emAberto.length === 0 ? (
        <EstadoVazio
          titulo="Nada em aberto"
          descricao="Todas as cobranças confirmadas já foram quitadas. Cobranças em rascunho não aparecem aqui."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {emAberto.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie p-5"
            >
              <div>
                <Link href={`/cobrancas/${c.id}`} className="font-medium text-destaque hover:underline">
                  {c.responsavel?.nome}
                </Link>
                <p className="mt-1 text-sm text-tinta-suave">
                  {c.mes_referencia.slice(0, 7).split('-').reverse().join('/')} ·{' '}
                  {formatarBRL(c.valor_total)} · recebido {formatarBRL(c.recebido)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-titulo text-lg text-alerta">
                  {formatarBRL(c.valor_total - c.recebido)}
                </span>
                <Selo tom={c.status === 'Parcial' ? 'alerta' : 'neutro'}>{c.status}</Selo>
                <Link
                  href={`/recebimentos?cobranca=${c.id}`}
                  className="font-medium text-destaque hover:underline"
                >
                  Dar baixa
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Pagamentos**

`src/app/(app)/pagamentos/acoes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { darBaixaPagamento, gerarContaPagar, previaFechamento } from '@/dados/pagamentos'
import { exigirGestora } from '@/dados/sessao'

export async function calcular(professorId: number, de: string, ate: string) {
  await exigirGestora()
  const f = await previaFechamento(professorId, de, ate)
  return {
    valor_total: f.valor_total,
    itens: f.itens.map((i) => ({
      aluno_nome: i.aluno_nome,
      turma_nome: i.turma_nome,
      data_aula: i.data_aula,
      valor_servico: i.valor_servico,
      percentual_aplicado: i.percentual_aplicado,
      valor_professor: i.valor_professor,
    })),
  }
}

export async function fechar(professorId: number, de: string, ate: string) {
  const sessao = await exigirGestora()
  const r = await gerarContaPagar(professorId, de, ate, sessao.nome)
  revalidatePath('/pagamentos')
  return r
}

export async function pagar(contaId: number, data: string, contaOrigemId: number) {
  const sessao = await exigirGestora()
  await darBaixaPagamento(contaId, data, contaOrigemId, sessao.nome)
  revalidatePath('/pagamentos')
}
```

`src/app/(app)/pagamentos/PainelFechamento.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { motion } from 'motion/react'
import { calcular, fechar } from './acoes'
import { Botao } from '@/ui/Botao'
import { Campo, entradaClasse } from '@/ui/Campo'
import { Cartao } from '@/ui/Cartao'
import { formatarBRL } from '@/dominio/dinheiro'

interface ItemPrevia {
  aluno_nome: string
  turma_nome: string
  data_aula: string
  valor_servico: number
  percentual_aplicado: number
  valor_professor: number
}

export function PainelFechamento({ professores }: { professores: { id: number; nome: string }[] }) {
  const router = useRouter()
  const hoje = new Date()
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [professorId, setProfessorId] = useState<number | null>(professores[0]?.id ?? null)
  const [de, setDe] = useState(primeiro)
  const [ate, setAte] = useState(ultimo)
  const [previa, setPrevia] = useState<{ valor_total: number; itens: ItemPrevia[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  return (
    <Cartao className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg">Fechar o período de um professor</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Soma o valor de cada aula com presença confirmada no período, aplicando o percentual de
          repasse vigente na data da aula. Ausências e aulas sem chamada não entram.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Professor" obrigatorio>
          <select
            value={professorId ?? ''}
            onChange={(e) => setProfessorId(e.target.value ? Number(e.target.value) : null)}
            className={entradaClasse}
          >
            {professores.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="De" obrigatorio>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={entradaClasse} />
        </Campo>
        <Campo etiqueta="Até" obrigatorio>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={entradaClasse} />
        </Campo>
      </div>

      <div className="flex flex-wrap gap-3">
        <Botao
          type="button"
          aparencia="secundario"
          disabled={pendente || professorId === null}
          onClick={() =>
            iniciar(async () => {
              setErro(null)
              setPrevia(await calcular(professorId!, de, ate))
            })
          }
        >
          {pendente ? 'Calculando…' : 'Calcular'}
        </Botao>

        {previa && previa.itens.length > 0 && (
          <Botao
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await fechar(professorId!, de, ate)
                if (r.ok) {
                  setPrevia(null)
                  router.refresh()
                } else {
                  setErro(r.erros?.join(' ') ?? 'Falha ao fechar.')
                }
              })
            }
          >
            Gerar conta a pagar
          </Botao>
        )}
      </div>

      {erro && (
        <p role="alert" className="rounded-campo bg-erro-suave px-4 py-3 text-erro">{erro}</p>
      )}

      {previa && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
          {previa.itens.length === 0 ? (
            <p className="rounded-campo bg-superficie-2 px-4 py-3 text-tinta-suave">
              Nenhuma presença confirmada e ainda não paga neste período.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-cartao border border-borda">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-borda bg-superficie-2/60 text-tinta-suave">
                      <th className="px-4 py-2 font-semibold">Data</th>
                      <th className="px-4 py-2 font-semibold">Aluno</th>
                      <th className="px-4 py-2 font-semibold">Turma</th>
                      <th className="px-4 py-2 font-semibold">Aula</th>
                      <th className="px-4 py-2 font-semibold">%</th>
                      <th className="px-4 py-2 font-semibold">Professor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.itens.map((i, n) => (
                      <tr key={n} className="border-b border-borda/60 last:border-0">
                        <td className="px-4 py-2">{i.data_aula.split('-').reverse().join('/')}</td>
                        <td className="px-4 py-2">{i.aluno_nome}</td>
                        <td className="px-4 py-2 text-tinta-suave">{i.turma_nome.slice(0, 34)}</td>
                        <td className="px-4 py-2">{formatarBRL(i.valor_servico)}</td>
                        <td className="px-4 py-2">{i.percentual_aplicado}%</td>
                        <td className="px-4 py-2 font-medium">{formatarBRL(i.valor_professor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-right font-titulo text-2xl">
                Total: {formatarBRL(previa.valor_total)}
              </p>
            </>
          )}
        </motion.div>
      )}
    </Cartao>
  )
}
```

`src/app/(app)/pagamentos/page.tsx`:
```tsx
import { clienteServidor } from '@/dados/cliente'
import { listarContasPagar } from '@/dados/pagamentos'
import { exigirGestora } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { EstadoVazio } from '@/ui/EstadoVazio'
import { Selo } from '@/ui/Selo'
import { PainelFechamento } from './PainelFechamento'

export default async function PaginaPagamentos() {
  await exigirGestora()
  const supabase = await clienteServidor()

  const [{ data: professores }, contas] = await Promise.all([
    supabase.from('professores').select('id, nome').eq('ativo', true).order('nome'),
    listarContasPagar(),
  ])

  const pendentes = contas.filter((c) => c.status === 'Pendente')

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Pagamentos a professores</h1>
        <p className="mt-1 text-tinta-suave">
          {pendentes.length} pendente(s) ·{' '}
          {formatarBRL(pendentes.reduce((s, c) => s + c.valor_total, 0))} a pagar
        </p>
      </header>

      <PainelFechamento professores={professores ?? []} />

      {contas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum fechamento ainda"
          descricao="Escolha o professor e o período acima, calcule e gere a conta a pagar."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {contas.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-cartao border border-borda bg-superficie p-5"
            >
              <div>
                <p className="font-medium">{c.professor?.nome}</p>
                <p className="mt-1 text-sm text-tinta-suave">
                  {c.periodo_inicio.split('-').reverse().join('/')} a{' '}
                  {c.periodo_fim.split('-').reverse().join('/')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-titulo text-lg">{formatarBRL(c.valor_total)}</span>
                <Selo tom={c.status === 'Pago' ? 'ativo' : 'alerta'}>{c.status}</Selo>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Navegação**

Em `src/ui/NavLateral.tsx`, criar uma seção `'Financeiro'` antes de `'Cadastros'`, com:
```ts
      { rotulo: 'Cobranças', href: '/cobrancas', papeis: ['gestora'] },
      { rotulo: 'Recebimentos', href: '/recebimentos', papeis: ['gestora'] },
      { rotulo: 'Pagamentos', href: '/pagamentos', papeis: ['gestora'] },
```

- [ ] **Step 4: Verificar e commitar**

```bash
npm run build && npx tsc --noEmit && npm test
git add -A
git commit -m "feat(financeiro): telas de recebimento e pagamento a professores"
```

---

### Task 12: Painel inicial

**Files:**
- Modify: `src/app/(app)/page.tsx`

- [ ] **Step 1: Implementar**

`src/app/(app)/page.tsx`:
```tsx
import Link from 'next/link'
import { listarCobrancas } from '@/dados/cobrancas'
import { listarAulas } from '@/dados/aulas'
import { listarPendencias } from '@/dados/reposicoes'
import { exigirSessao } from '@/dados/sessao'
import { formatarBRL } from '@/dominio/dinheiro'
import { Cartao } from '@/ui/Cartao'
import { Selo } from '@/ui/Selo'

export default async function PaginaInicial() {
  const sessao = await exigirSessao()
  const hoje = new Date().toISOString().slice(0, 10)
  const ehGestora = sessao.papel === 'gestora'

  const [aulasHoje, pendencias, cobrancas] = await Promise.all([
    listarAulas({
      de: hoje,
      ate: hoje,
      professorId: ehGestora ? undefined : (sessao.professorId ?? -1),
    }),
    ehGestora ? listarPendencias({ status: 'Pendente' }) : Promise.resolve([]),
    ehGestora ? listarCobrancas() : Promise.resolve([]),
  ])

  const emAberto = cobrancas.filter((c) => c.status !== 'Rascunho' && c.valor_total - c.recebido > 0)
  const aReceber = emAberto.reduce((s, c) => s + (c.valor_total - c.recebido), 0)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl">Olá, {sessao.nome}</h1>
        <p className="mt-1 text-tinta-suave">
          {new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      <Cartao>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg">Aulas de hoje</h2>
          <Link href="/agenda" className="text-sm text-destaque hover:underline">
            ver agenda
          </Link>
        </div>

        {aulasHoje.length === 0 ? (
          <p className="text-tinta-suave">Nenhuma aula hoje.</p>
        ) : (
          <ul className="divide-y divide-borda/60">
            {aulasHoje.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <Link href={`/agenda/aulas/${a.id}`} className="hover:underline">
                  <span className="font-medium">{a.data_hora_inicio.slice(11, 16)}</span>
                  <span className="ml-3 text-tinta-suave">{a.turma?.nome}</span>
                </Link>
                <Selo tom={a.status === 'Realizada' ? 'ativo' : 'neutro'}>{a.status}</Selo>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      {ehGestora && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/reposicoes">
            <Cartao className="h-full transition-all hover:-translate-y-0.5 hover:border-destaque/40">
              <p className="text-sm text-tinta-suave">Reposições a agendar</p>
              <p className="mt-1 font-titulo text-3xl">{pendencias.length}</p>
              {pendencias.length > 0 && (
                <p className="mt-2 text-sm text-alerta">
                  {pendencias
                    .slice(0, 3)
                    .map((p) => p.aluno?.nome)
                    .join(', ')}
                  {pendencias.length > 3 ? '…' : ''}
                </p>
              )}
            </Cartao>
          </Link>

          <Link href="/recebimentos">
            <Cartao className="h-full transition-all hover:-translate-y-0.5 hover:border-destaque/40">
              <p className="text-sm text-tinta-suave">A receber</p>
              <p className="mt-1 font-titulo text-3xl">{formatarBRL(aReceber)}</p>
              <p className="mt-2 text-sm text-tinta-suave">
                {emAberto.length} cobrança(s) em aberto
              </p>
            </Cartao>
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar e commitar**

```bash
npm run build && npx tsc --noEmit
git add "src/app/(app)/page.tsx"
git commit -m "feat(painel): aulas do dia, reposicoes pendentes e valor a receber"
```

---

### Task 13: Verificação final do Plano 3

- [ ] **Step 1: Suite, tipos e build**

```bash
npm test
npx tsc --noEmit
npm run build
```
Expected: 14 arquivos / 128 testes, sem erro de tipo, build limpo.

- [ ] **Step 2: Estender o e2e**

Em `scripts/verificar-e2e.mjs`, acrescentar ao array `CASOS`:
```js
  ['/cobrancas', ['Cobranças', 'Gerar cobranças'], 'cobrancas'],
  ['/recebimentos', ['Recebimentos'], 'recebimentos'],
  ['/pagamentos', ['Pagamentos a professores', 'Beatriz Lima'], 'pagamentos'],
```
Run: `node scripts/verificar-e2e.mjs`
Expected: **25 ok, 0 falha(s)**.

- [ ] **Step 3: Provar o ciclo financeiro completo contra o banco real**

Crie um script temporário (apague ao final) que, com a service role key, prove nesta ordem e reporte a saída de cada passo:

1. Gerar as cobranças de agosto/2026. Contar cobranças e itens.
2. **Gerar de novo.** Confirmar que nenhum item novo foi criado e a contagem é idêntica.
3. Tentar inserir um `itens_cobranca` com `aula_id` já usado. **Deve falhar** com violação de unicidade — é a idempotência garantida pelo Postgres.
4. Confirmar uma cobrança e conferir que `texto_whatsapp` foi gerado, contendo `TOTAL:` e o nome do responsável.
5. Registrar um recebimento **parcial** (metade do total) e conferir que o status virou `Parcial`.
6. Registrar o restante e conferir que virou `Quitada`.
7. Fechar o período de um professor e conferir que `valor_total` = soma de (valor do serviço × percentual) das presenças confirmadas.
8. Tentar fechar o **mesmo período de novo**. Deve reportar que não há presença nova a pagar, ou falhar na unicidade de `presenca_id` — as duas são o comportamento correto.

- [ ] **Step 4: Conferir a aritmética à mão**

```bash
node scripts/consultar.mjs cobrancas "responsavel_id,valor_bruto,valor_desconto,valor_total,status"
node scripts/consultar.mjs itens_conta_pagar_professor "data_aula,valor_servico,percentual_aplicado,valor_professor"
```
Confira que `valor_total = valor_bruto − valor_desconto` em cada cobrança, e que `valor_professor = valor_servico × percentual_aplicado / 100` em cada item, sem centavo perdido.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore: verificacao final do Plano 3 (financeiro)"
```

---

## Cobertura do spec

| Requisito | Tarefas |
|---|---|
| §4.2 cobranças, itens, recebimentos | 1 |
| §4.2 contas a pagar + snapshot do fechamento | 2 |
| §4.4 RLS financeiro exclusivo da gestora | 1, 2 |
| §5.1 geração mensal consolidada e idempotente | 3, 7, 9 |
| §6.4 texto para WhatsApp | 4, 7, 10 |
| §5.4 quitação total e parcial | 5, 8, 11 |
| §5.3 repasse com vigência histórica | 6, 8, 11 |
| §3.3 precisão monetária | 3–6, 13 |
| §7.1 assistentes passo a passo nos fluxos de dinheiro | 10, 11 |
| §7.3 rotas `/cobrancas`, `/recebimentos`, `/pagamentos` | 10, 11 |
| Painel inicial (§9, fase 9) | 12 |
| RNF de logs | 7, 8 |

**Fora de escopo:** portal do responsável, envio automático por API de WhatsApp, migração das planilhas existentes e o OAuth do Google Calendar ligado em produção.

## Cobertura do spec até aqui

| Requisito | Tarefas |
|---|---|
| §4.2 `cobrancas`, `itens_cobranca`, `recebimentos` | 1 |
| §4.2 `contas_pagar_professor` + itens | 2 |
| §4.4 RLS financeiro exclusivo da gestora | 1, 2 |
| §5.1 geração de cobrança e idempotência | 1, 3 |
| §6.4 texto para WhatsApp | 4 |
| §5.4 quitação total e parcial | 5 |
| §5.3 repasse com vigência histórica | 6 |
| §3.3 precisão monetária | 3, 4, 5, 6 |
