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
Expected: PASS, 14 arquivos, 129 testes.

- [ ] **Step 5: Commit**

```bash
git add src/dominio/pagamentos/
git commit -m "feat(dominio): fechamento de repasse por presenca confirmada"
```

---

## Continuação

As tarefas 7 a 14 cobrem a camada de dados (cobranças, recebimentos, pagamentos), as telas dos três módulos, o painel inicial e a verificação final. Serão escritas na sequência.

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
