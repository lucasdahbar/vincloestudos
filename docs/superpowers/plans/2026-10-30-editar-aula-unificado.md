# Editar aula unificado (com modalidade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os dois botões de hoje na tela da aula ("Remarcar esta aula" e "Mudar esta aula") por um único "Editar aula" que primeiro pergunta o escopo (só esta / a partir de uma data / série inteira) e abre direto uma tela com todos os campos editáveis juntos (dia/horário, professor, serviço e — novo — modalidade).

**Architecture:** `aulas.modalidade` nasce como nova coluna, seguindo exatamente o padrão já existente de `professor_id`/`servico_id` (Etapa 2 de "turmas como agenda"): gatilho de herança na criação, propagação da turma para as aulas futuras sem chamada, e edição "só esta aula" vs. "série" decidindo onde grava. A varredura (`dominio/agenda/varredura.ts`) e a divisão de série (`dominio/turmas/divisao.ts`) ganham a flag/campo `modalidade` ao lado dos já existentes. A página `/turmas/[id]/mudar` perde o seletor "O que mudar" (ação sempre "editar tudo") e o formulário da prévia mostra os 4 campos juntos. A integração com o Google (evento avulso com link da modalidade da aula, criação de sala nova quando a turma isolada precisa) é a última tarefa, isolada, por tocar código sensível de sincronização já responsável por um bug grave anterior.

**Tech Stack:** Next.js 16 (Server Actions), Supabase/Postgres (RLS, triggers, RPC), Vitest, TypeScript, Tailwind v4.

---

## Task 1: Migração `aulas.modalidade`

**Files:**
- Create: `supabase/migrations/20261030000300_aula_guarda_modalidade.sql`

- [ ] **Step 1: Escrever a migração**

Segue exatamente o padrão da migração `20261029000300_aula_guarda_professor_e_servico.sql`: nova coluna, preenchida com o valor atual da turma, gatilhos de herança e propagação atualizados para incluir `modalidade`.

```sql
-- Extensao de "turmas como agenda" (30/10/2026): a aula tambem guarda a
-- propria modalidade, do mesmo jeito que professor_id e servico_id (Etapa 2).
--
-- Pedido do tio (30/10/2026): poder trocar a modalidade de uma aula isolada
-- (ex: aula presencial que essa semana vira online), sem mudar a turma toda.

alter table public.aulas
  add column modalidade public.modalidade;

update public.aulas a
   set modalidade = t.modalidade
  from public.turmas t
 where t.id = a.turma_id;

alter table public.aulas
  alter column modalidade set not null;

-- A aula nasce com a modalidade da turma, igual professor_id e servico_id.
create or replace function public.aula_herda_da_turma()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.professor_id is null or new.servico_id is null or new.modalidade is null then
    select coalesce(new.professor_id, t.professor_id),
           coalesce(new.servico_id, t.servico_id),
           coalesce(new.modalidade, t.modalidade)
      into new.professor_id, new.servico_id, new.modalidade
      from turmas t
     where t.id = new.turma_id;
  end if;
  return new;
end;
$$;

-- Trocar a modalidade da turma tambem propaga so para aulas Agendadas de
-- hoje em diante sem chamada, igual professor_id e servico_id.
create or replace function public.turma_propaga_para_aulas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('vinclo.sem_propagar', true), '') = 'on' then
    return new;
  end if;
  update aulas a
     set professor_id = case when a.professor_id = old.professor_id then new.professor_id else a.professor_id end,
         servico_id = case when a.servico_id = old.servico_id then new.servico_id else a.servico_id end,
         modalidade = case when a.modalidade = old.modalidade then new.modalidade else a.modalidade end
   where a.turma_id = new.id
     and a.status = 'Agendada'
     and a.data_hora_inicio::date >= (now() at time zone 'America/Sao_Paulo')::date
     and not exists (select 1 from presencas p where p.aula_id = a.id);
  return new;
end;
$$;

create trigger turma_propaga_para_aulas
  after update of professor_id, servico_id, modalidade on public.turmas
  for each row
  when (
    old.professor_id is distinct from new.professor_id
    or old.servico_id is distinct from new.servico_id
    or old.modalidade is distinct from new.modalidade
  )
  execute function public.turma_propaga_para_aulas();
```

A última instrução recria o gatilho `turma_propaga_para_aulas` (ele já existe
ligado em `professor_id, servico_id`) para incluir `modalidade` na lista de
colunas observadas — por isso é `drop trigger` implícito via `create or
replace function` seguido de `create trigger`. Como o Postgres não permite
`create trigger` duplicado, adicione antes:

```sql
drop trigger if exists turma_propaga_para_aulas on public.turmas;
```

Coloque essa linha imediatamente antes do `create trigger turma_propaga_para_aulas` no arquivo.

- [ ] **Step 2: Aplicar a migração no banco remoto**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep -E "^SUPABASE_ACCESS_TOKEN=" .env.local | cut -d= -f2-) && npx supabase db push --linked --yes
```

Expected: a migração aplica sem erro (aviso sobre docker pode ser ignorado).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261030000300_aula_guarda_modalidade.sql
git commit -m "feat(aulas): aula guarda a propria modalidade"
```

---

## Task 2: `varredura.ts` — campo `modalidade` na ação de editar

**Files:**
- Modify: `src/dominio/agenda/varredura.ts`
- Test: `src/dominio/agenda/varredura.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/dominio/agenda/varredura.test.ts` (antes do fechamento do arquivo), um novo `describe`:

```ts
describe('varrer: editar a modalidade', () => {
  const modalidade = { tipo: 'editar', modalidade: true } as const

  it('muda em qualquer aula que ainda não aconteceu', () => {
    const v = varrer([aula({ situacao: sit('Confirmada', { cobranca: 'Recebida' }) })], modalidade, 'serie')
    expect(v.aulas[0].grupo).toBe('muda')
    expect(v.aulas[0].campos).toMatchObject({ modalidade: true })
  })

  it('aula realizada não muda, como dia/horário', () => {
    const realizada = aula({ situacao: sit('Realizada') })
    expect(varrer([realizada], modalidade, 'serie').aulas[0].grupo).toBe('fica')
    expect(varrer([realizada], modalidade, 'esta').aulas[0].grupo).toBe('fica')
  })

  it('aula aguardando chamada pergunta se aconteceu, como dia/horário', () => {
    const pendente = aula({ situacao: sit('Aguardando chamada') })
    expect(varrer([pendente], modalidade, 'serie').aulas[0]).toMatchObject({ grupo: 'escolha', pergunta: 'aconteceu' })
  })
})

describe('errosDaEdicao: modalidade', () => {
  it('bloqueia modalidade quando a aula não libera o campo', () => {
    const presa: AulaVarrida = {
      id: 10,
      data: '2026-11-09',
      inicio: '2026-11-09T18:00',
      situacao: 'Realizada',
      grupo: 'fica',
      motivo: 'Esta aula já aconteceu: a chamada foi feita.',
      alunos: [],
      avisos: [],
      campos: {},
    }
    expect(errosDaEdicao(presa, { modalidade: true })).toEqual([
      'Nesta aula não dá para mudar a modalidade. Esta aula já aconteceu: a chamada foi feita.',
    ])
  })
})
```

Isso exige importar `AulaVarrida` no topo do arquivo de teste:

```ts
import type { AulaVarrida, SituacaoDaAula } from './situacao'
```

Espera — `AulaVarrida` vem de `./varredura`, não de `./situacao`. Ajuste o import existente no topo do arquivo para:

```ts
import { errosDaEdicao, planoDeSaida, varrer, type AlunoDaVarredura, type AulaDaVarredura, type AulaVarrida } from './varredura'
import type { SituacaoDaAula } from './situacao'
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npx vitest run src/dominio/agenda/varredura.test.ts
```

Expected: FAIL — `modalidade` não existe em `Acao`, e `campos.modalidade`/mensagem de erro não são produzidos.

- [ ] **Step 3: Implementar em `varredura.ts`**

Em `src/dominio/agenda/varredura.ts`, no tipo `Acao` (linha 20):

```ts
export type Acao =
  | { tipo: 'editar'; quando?: boolean; professor?: boolean; servico?: boolean; modalidade?: boolean }
  | { tipo: 'excluir' }
  | { tipo: 'encerrar' }
```

No campo `campos` de `AulaVarrida` (linha 80):

```ts
  /** Editar: o que de fato muda nesta aula. */
  campos?: { quando?: boolean; professor?: boolean; servico?: boolean; modalidade?: boolean }
```

Na função `editar` (linha 144 em diante), a modalidade segue a mesma regra de
`quando` — depende de a aula ter acontecido, sem olhar cobrança nem pagamento.
Ajustar a condição da pergunta "aconteceu" (linha 155) para incluir
`acao.modalidade`:

```ts
  if (acao.quando || acao.professor || acao.modalidade) {
    const r = perguntar(a, respostas, 'A aula aconteceu: faça a chamada, ou exclua a aula, antes de mudá-la.')
    if (r) return r
  }
```

E, depois do bloco `if (acao.servico) { ... }` (antes da linha 205 `const algum = ...`), adicionar:

```ts
  if (acao.modalidade) {
    campos.modalidade = !realizada
    if (realizada) motivos.push(JA_ACONTECEU)
  }
```

Por fim, atualizar `NOME_DO_CAMPO` (linha 210) e a assinatura de `errosDaEdicao` (linha 218):

```ts
const NOME_DO_CAMPO = {
  quando: 'o dia ou o horário',
  professor: 'o professor',
  servico: 'o serviço',
  modalidade: 'a modalidade',
} as const
```

```ts
export function errosDaEdicao(
  aula: AulaVarrida | undefined,
  pedido: { quando?: boolean; professor?: boolean; servico?: boolean; modalidade?: boolean },
): string[] {
```

(o corpo da função não precisa mudar — já itera sobre `Object.keys(NOME_DO_CAMPO)`).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npx vitest run src/dominio/agenda/varredura.test.ts
```

Expected: PASS em todos os testes do arquivo (antigos e novos).

- [ ] **Step 5: Commit**

```bash
git add src/dominio/agenda/varredura.ts src/dominio/agenda/varredura.test.ts
git commit -m "feat(agenda): varredura cobre editar a modalidade da aula"
```

---

## Task 3: `dados/varredura.ts` — ler `modalidade` de cada aula

**Files:**
- Modify: `src/dados/varredura.ts`

A varredura por aula (`aulasParaVarredura`) hoje não lê `modalidade` — não
precisa, porque a decisão de "pode mudar" na Task 2 não depende de dados além
da situação da aula. Nenhuma mudança é necessária aqui. (Mantido como task
para documentar a decisão — pule para a Task 4.)

- [ ] **Step 1: Confirmar que nada muda**

Abra `src/dados/varredura.ts` e confirme que `AulaDaVarredura` (import de
`@/dominio/agenda/varredura`) não precisa de `modalidade`: a flag `campos.modalidade`
produzida por `varrer()` só depende de `situacao`, já lido. Nenhum passo de
código nesta task.

---

## Task 4: `dominio/turmas/divisao.ts` — `modalidade` na mudança de série

**Files:**
- Modify: `src/dominio/turmas/divisao.ts`
- Test: `src/dominio/turmas/divisao.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

No topo de `src/dominio/turmas/divisao.test.ts`, os fixtures `turma` (linha
12) e `aula` (linha 24) precisam de `modalidade`. Ajustar:

```ts
const turma: TurmaDaDivisao = {
  tipo_recorrencia: 'Recorrente',
  status: 'Ativa',
  data_inicio: '2031-03-03',
  data_fim: '2031-04-30',
  dias_semana: [1],
  horario_inicio: '10:00',
  horario_fim: '11:00',
  professor_id: 9,
  servico_id: 3,
  modalidade: 'Presencial',
}

const aula = (id: number, data: string, over: Partial<AulaDaDivisao> = {}): AulaDaDivisao => ({
  id,
  data,
  inicio: `${data}T10:00`,
  fim: `${data}T11:00`,
  original: null,
  status: 'Agendada',
  professor_id: 9,
  servico_id: 3,
  modalidade: 'Presencial',
  ...over,
})
```

E adicionar, depois do `describe('planoDeDivisao: trocar o professor', ...)`
ou bloco equivalente que trata `servico_id` (procure por ele e siga o mesmo
formato), um novo teste:

```ts
describe('planoDeDivisao: trocar a modalidade', () => {
  it('toda aula do corte em diante recebe a modalidade nova', () => {
    const r = planoDeDivisao(turma, aulas, varredura({ modalidade: true }), { modalidade_nova: 'Online' }, opcoes)
    expect(r.erros).toEqual([])
    expect(r.aulas.every((a) => a.modalidade === 'Online')).toBe(true)
  })

  it('aula com substituta de modalidade fica com ela, como o professor', () => {
    const lista = aulas.map((a) => (a.id === 3 ? { ...a, modalidade: 'Online' as const } : a))
    const r = planoDeDivisao(turma, lista, varredura({ modalidade: true }, lista), { modalidade_nova: 'Presencial' }, opcoes)
    const dela = r.aulas.find((a) => a.id === 3)
    expect(dela?.modalidade).toBe('Online')
  })
})
```

Note o nome do campo da mudança: `modalidade_nova`, não `modalidade` — para
não colidir com o campo `modalidade` de `AulaDaDivisao`/`AulaDividida` usado
no resultado. Siga esse nome exato nos próximos steps.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npx vitest run src/dominio/turmas/divisao.test.ts
```

Expected: FAIL — `modalidade` não existe em `TurmaDaDivisao`/`AulaDaDivisao`, e `modalidade_nova` não existe em `MudancaDaSerie`.

- [ ] **Step 3: Implementar em `divisao.ts`**

Em `src/dominio/turmas/divisao.ts`, `MudancaDaSerie` (linha 18):

```ts
export interface MudancaDaSerie {
  quando?: { dias_semana: number[]; horario_inicio: string; horario_fim: string }
  professor_id?: number
  servico_id?: number
  modalidade_nova?: 'Presencial' | 'Online'
}
```

`TurmaDaDivisao` (linha 24):

```ts
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
  modalidade: 'Presencial' | 'Online'
}
```

`AulaDaDivisao` (linha 37) e `AulaDividida` (linha 52) ganham `modalidade`:

```ts
export interface AulaDaDivisao {
  id: number
  data: string
  inicio: string
  fim: string
  original: string | null
  status: StatusAula
  professor_id: number
  servico_id: number
  modalidade: 'Presencial' | 'Online'
}

export interface AulaDividida {
  id: number
  inicio: string
  fim: string
  original: string | null
  professor_id: number
  servico_id: number
  modalidade: 'Presencial' | 'Online'
}
```

Em `errosDaMudanca` (linha 98), incluir `modalidade_nova` na checagem de "a
regra nova é igual à de hoje" (linha 108-115):

```ts
  const igual =
    (!m.quando ||
      (mesmos(m.quando.dias_semana, t.dias_semana) &&
        m.quando.horario_inicio === t.horario_inicio &&
        m.quando.horario_fim === t.horario_fim)) &&
    (m.professor_id === undefined || m.professor_id === t.professor_id) &&
    (m.servico_id === undefined || m.servico_id === t.servico_id) &&
    (m.modalidade_nova === undefined || m.modalidade_nova === t.modalidade)
  return igual ? ['A regra nova é igual à de hoje.'] : []
```

Em `planoDeDivisao`, dentro do `.map` que monta `final` (linha 170-187),
adicionar `modalidade` seguindo o mesmo padrão de `servico_id` (olha
`campos.modalidade`, e só troca quando a aula ainda está com a modalidade da
turma de hoje):

```ts
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
        modalidade:
          campos.modalidade && mudanca.modalidade_nova !== undefined && a.modalidade === turma.modalidade
            ? mudanca.modalidade_nova
            : a.modalidade,
      }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npx vitest run src/dominio/turmas/divisao.test.ts
```

Expected: PASS em todos os testes do arquivo.

- [ ] **Step 5: Rodar o tsc para pegar os outros lugares que quebraram**

```bash
npx tsc --noEmit
```

Expected: erros em `src/dados/divisao-turma.ts` (fixture `regraDeHoje` sem
`modalidade`) e em `src/dados/edicao-aula.ts` (ainda não tocado) — tratados
nas próximas tasks. Anote os arquivos com erro antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add src/dominio/turmas/divisao.ts src/dominio/turmas/divisao.test.ts
git commit -m "feat(turmas): divisao da serie cobre a modalidade"
```

---

## Task 5: `dados/divisao-turma.ts` e `dividir_turma` — gravar modalidade na série

**Files:**
- Modify: `src/dados/divisao-turma.ts`
- Modify: `supabase/migrations/20261030000200_dividir_turma.sql` → **não edite a migração aplicada**; crie uma nova.
- Create: `supabase/migrations/20261030000400_dividir_turma_modalidade.sql`

- [ ] **Step 1: Ler a aula com `modalidade` em `mudarSerie`**

Em `src/dados/divisao-turma.ts`, a consulta de aulas (linha 44-57) e o mapeamento para `AulaDaDivisao` ganham `modalidade`:

```ts
  const { data: lidas, error } = await supabase
    .from('aulas')
    .select('id, status, data_hora_inicio, data_hora_fim, data_hora_original, data_hora_referencia, professor_id, servico_id, modalidade')
    .eq('turma_id', turmaId)
  if (error) return { ok: false, erros: [error.message] }
  const aulas: AulaDaDivisao[] = (lidas ?? []).map((a) => ({
    id: a.id,
    data: String(a.data_hora_referencia).slice(0, 10),
    inicio: minuto(a.data_hora_inicio),
    fim: minuto(a.data_hora_fim),
    original: a.data_hora_original ? minuto(a.data_hora_original) : null,
    status: a.status,
    professor_id: a.professor_id,
    servico_id: a.servico_id,
    modalidade: a.modalidade,
  }))
```

A varredura (linha 59-69) ganha a flag `modalidade`:

```ts
  const v = varrer(
    await aulasParaVarredura(turmaId, escopo, { aPartirDe }),
    {
      tipo: 'editar',
      quando: mudanca.quando !== undefined,
      professor: mudanca.professor_id !== undefined,
      servico: mudanca.servico_id !== undefined,
      modalidade: mudanca.modalidade_nova !== undefined,
    },
    escopo,
    respostas,
  )
```

`regraDeHoje` (linha 76-86) ganha `modalidade`:

```ts
  const regraDeHoje = {
    tipo_recorrencia: turma.tipo_recorrencia,
    status: turma.status,
    data_inicio: turma.data_inicio ? String(turma.data_inicio).slice(0, 10) : null,
    data_fim: turma.data_fim ? String(turma.data_fim).slice(0, 10) : null,
    dias_semana: turma.dias_semana ?? [],
    horario_inicio: String(turma.horario_inicio).slice(0, 5),
    horario_fim: String(turma.horario_fim).slice(0, 5),
    professor_id: turma.professor_id,
    servico_id: turma.servico_id,
    modalidade: turma.modalidade,
  }
```

O nome gerado pela turma (linha 90-103) já recebe `modalidade: turma.modalidade`
no `gerarNomeTurma` — ajustar para usar a modalidade nova quando ela mudar:

```ts
  // O nome leva o servico: so muda com ele.
  const servicoId = mudanca.servico_id ?? turma.servico_id
  const modalidadeNova = mudanca.modalidade_nova ?? turma.modalidade
  let nome = turma.nome
  if (servicoId !== turma.servico_id || modalidadeNova !== turma.modalidade) {
    const { data: servico } = await supabase.from('servicos').select('nome').eq('id', servicoId).maybeSingle()
    if (!servico) return { ok: false, erros: ['Selecione um serviço válido.'] }
    nome = gerarNomeTurma({
      materia: turma.materia?.nome ?? null,
      anoEscolar: turma.ano_escolar?.nome ?? null,
      escola: turma.escola?.nome ?? null,
      servico: servico.nome,
      modalidade: modalidadeNova,
    })
  }
```

Confira em `src/dominio/turmas/nome.ts` que `gerarNomeTurma` já aceita
`modalidade` nesse formato (ele já era usado assim antes — apenas confirme a
assinatura, sem editar o arquivo).

E a chamada ao RPC (linha 106-119) passa a modalidade nova em `p_regra`:

```ts
  const quando = mudanca.quando ?? regraDeHoje
  const { data: destino, error: erro } = await supabase.rpc('dividir_turma', {
    p_turma_id: turmaId,
    p_corte: plano.corte,
    p_nova: plano.novaTurma,
    p_regra: {
      nome,
      dias_semana: quando.dias_semana,
      horario_inicio: quando.horario_inicio,
      horario_fim: quando.horario_fim,
      professor_id: mudanca.professor_id ?? turma.professor_id,
      servico_id: servicoId,
      modalidade: modalidadeNova,
    },
    p_aulas: plano.aulas,
  })
```

E `plano.aulas` (vindo de `planoDeDivisao`, Task 4) já inclui `modalidade` por
aula em cada item de `AulaDividida` — nada a mudar na montagem de `p_aulas`,
que é passada direto.

- [ ] **Step 2: Escrever a migração que atualiza `dividir_turma`**

Criar `supabase/migrations/20261030000400_dividir_turma_modalidade.sql`:

```sql
-- Extensao de "editar aula unificado" (30/10/2026): dividir_turma tambem
-- grava a modalidade, tanto da turma nova/existente quanto de cada aula.

create or replace function public.dividir_turma(
  p_turma_id bigint,
  p_corte date,
  p_nova boolean,
  p_regra jsonb,
  p_aulas jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turma turmas%rowtype;
  v_destino bigint;
  v_esperadas bigint[];
  v_recebidas bigint[];
begin
  if not public.e_gestora() then
    raise exception 'Só a gestora pode mudar turmas.';
  end if;

  select * into v_turma from turmas where id = p_turma_id for update;
  if not found then
    raise exception 'Esta turma não existe mais.';
  end if;
  if v_turma.status <> 'Ativa' or v_turma.tipo_recorrencia <> 'Recorrente' then
    raise exception 'Só uma turma recorrente e ativa muda a partir de uma data.';
  end if;
  if p_corte < v_turma.data_inicio or p_corte > v_turma.data_fim then
    raise exception 'A data está fora do período da turma.';
  end if;

  if p_nova <> exists (
    select 1 from aulas
     where turma_id = p_turma_id
       and (data_hora_referencia at time zone 'UTC')::date < p_corte
  ) then
    raise exception 'As aulas da turma mudaram desde a prévia. Abra a prévia de novo.';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_esperadas
    from aulas_da_turma_desde(p_turma_id, p_corte) as id;
  select coalesce(array_agg((x ->> 'id')::bigint order by (x ->> 'id')::bigint), '{}') into v_recebidas
    from jsonb_array_elements(p_aulas) as x;
  if v_esperadas <> v_recebidas then
    raise exception 'As aulas da turma mudaram desde a prévia. Abra a prévia de novo.';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_aulas) as x (id bigint, inicio text, professor_id bigint)
      join aulas a on a.id = x.id
     where exists (select 1 from presencas p where p.aula_id = a.id)
       and (a.data_hora_inicio <> (x.inicio::timestamp at time zone 'UTC') or a.professor_id <> x.professor_id)
  ) then
    raise exception 'Uma aula com chamada feita mudaria. Abra a prévia de novo.';
  end if;

  perform set_config('vinclo.sem_propagar', 'on', true);

  if p_nova then
    insert into turmas (
      nome, servico_id, materia_id, escola_id, ano_escolar_id, professor_id, modalidade,
      dias_semana, horario_inicio, horario_fim, status, tipo_recorrencia, frequencia, intervalo,
      data_inicio, data_fim, fim_automatico, link_videochamada, google_meet_sala, continua_de
    )
    values (
      p_regra ->> 'nome', (p_regra ->> 'servico_id')::bigint, v_turma.materia_id, v_turma.escola_id,
      v_turma.ano_escolar_id, (p_regra ->> 'professor_id')::bigint, (p_regra ->> 'modalidade')::modalidade,
      array(select jsonb_array_elements_text(p_regra -> 'dias_semana')::smallint),
      (p_regra ->> 'horario_inicio')::time, (p_regra ->> 'horario_fim')::time,
      'Ativa', 'Recorrente', v_turma.frequencia, v_turma.intervalo,
      p_corte, v_turma.data_fim, v_turma.fim_automatico, v_turma.link_videochamada,
      v_turma.google_meet_sala, p_turma_id
    )
    returning id into v_destino;

    update turmas set data_fim = p_corte - 1, fim_automatico = false where id = p_turma_id;

    update matriculas set turma_id = v_destino
     where turma_id = p_turma_id and status = 'Ativa' and data_inicio >= p_corte;

    insert into matriculas (aluno_id, turma_id, data_inicio, data_fim, flag_reposicao, status)
    select aluno_id, v_destino, p_corte, data_fim, flag_reposicao, 'Ativa'
      from matriculas
     where turma_id = p_turma_id and status = 'Ativa'
       and data_inicio < p_corte and (data_fim is null or data_fim >= p_corte);

    update matriculas set data_fim = p_corte - 1
     where turma_id = p_turma_id and status = 'Ativa'
       and data_inicio < p_corte and (data_fim is null or data_fim >= p_corte);
  else
    v_destino := p_turma_id;
    update turmas
       set nome = p_regra ->> 'nome',
           servico_id = (p_regra ->> 'servico_id')::bigint,
           professor_id = (p_regra ->> 'professor_id')::bigint,
           modalidade = (p_regra ->> 'modalidade')::modalidade,
           dias_semana = array(select jsonb_array_elements_text(p_regra -> 'dias_semana')::smallint),
           horario_inicio = (p_regra ->> 'horario_inicio')::time,
           horario_fim = (p_regra ->> 'horario_fim')::time
     where id = p_turma_id;
  end if;

  update aulas a
     set google_calendar_event_id = 'divisao:' || a.id
   where a.id = any (v_recebidas);

  update aulas a
     set turma_id = v_destino,
         data_hora_inicio = x.inicio::timestamp at time zone 'UTC',
         data_hora_fim = x.fim::timestamp at time zone 'UTC',
         data_hora_original = case when x.original is null then null else x.original::timestamp at time zone 'UTC' end,
         professor_id = x.professor_id,
         servico_id = x.servico_id,
         modalidade = x.modalidade,
         google_calendar_event_id = 'local:t' || v_destino || ':' || coalesce(x.original, x.inicio)
    from jsonb_to_recordset(p_aulas)
      as x (id bigint, inicio text, fim text, original text, professor_id bigint, servico_id bigint, modalidade modalidade)
   where a.id = x.id;

  return v_destino;
end;
$$;
```

- [ ] **Step 2: Aplicar a migração**

```bash
export SUPABASE_ACCESS_TOKEN=$(grep -E "^SUPABASE_ACCESS_TOKEN=" .env.local | cut -d= -f2-) && npx supabase db push --linked --yes
```

Expected: aplica sem erro.

- [ ] **Step 3: tsc e lint**

```bash
npx tsc --noEmit
```

Expected: sem erros em `src/dados/divisao-turma.ts`. Pode restar erro em
`src/dados/edicao-aula.ts` (Task 6) e na página `mudar` (Task 7/8) — segue.

- [ ] **Step 4: Commit**

```bash
git add src/dados/divisao-turma.ts supabase/migrations/20261030000400_dividir_turma_modalidade.sql
git commit -m "feat(turmas): dividir_turma grava a modalidade por turma e por aula"
```

---

## Task 6: `dados/edicao-aula.ts` — modalidade na edição de "só esta aula"

**Files:**
- Modify: `src/dados/edicao-aula.ts`

- [ ] **Step 1: Adicionar `modalidade` a `EdicaoDaAula` e aplicar na gravação**

Em `src/dados/edicao-aula.ts`, `EdicaoDaAula` (linha 8-17):

```ts
export interface EdicaoDaAula {
  /** Dia e horario novos; nulo = nao muda. */
  nova: NovoHorario | null
  /** Professor novo; nulo = nao muda. */
  professorId: number | null
  /** Modalidade nova; nulo = nao muda. */
  modalidade: 'Presencial' | 'Online' | null
  /** Decisao 5: resposta a "a aula aconteceu?", quando ela passou sem chamada. */
  aconteceu?: boolean
  /** A data nova cai em feriado ou recesso, e a gestora confirmou. */
  confirmouAlerta?: boolean
}
```

Em `editarAula` (linha 31-91), a leitura da aula (linha 33-37) ganha
`modalidade`, a checagem de "o que mudou" inclui a modalidade, e a gravação
grava `aulas.modalidade` quando ela mudou:

```ts
export async function editarAula(aulaId: number, e: EdicaoDaAula): Promise<ResultadoEdicao> {
  const supabase = await clienteServidor()
  const { data: aula, error } = await supabase
    .from('aulas')
    .select('id, turma_id, professor_id, modalidade')
    .eq('id', aulaId)
    .maybeSingle()
  if (error) return { ok: false, erros: ['Não foi possível conferir a aula agora. Tente de novo.'] }
  if (!aula) return { ok: false, erros: ['Esta aula não existe mais.'] }

  const trocaProfessor = e.professorId !== null && e.professorId !== aula.professor_id
  const trocaModalidade = e.modalidade !== null && e.modalidade !== aula.modalidade
  const pedido = { quando: e.nova !== null, professor: trocaProfessor, modalidade: trocaModalidade }
  if (!pedido.quando && !pedido.professor && !pedido.modalidade) {
    return { ok: false, erros: ['Nada mudou nesta aula.'] }
  }

  if (trocaProfessor) {
    const { data: professor } = await supabase
      .from('professores')
      .select('id, ativo')
      .eq('id', e.professorId!)
      .maybeSingle()
    if (!professor?.ativo) return { ok: false, erros: ['Escolha um professor ativo.'] }
  }

  const fatos = await aulasParaVarredura(aula.turma_id, 'esta', { aulaId })
  const v = varrer(
    fatos,
    { tipo: 'editar', ...pedido },
    'esta',
    e.aconteceu === undefined ? {} : { aconteceu: { [aulaId]: e.aconteceu } },
  )
  const erros = errosDaEdicao(v.aulas[0], pedido)
  if (erros.length > 0) return { ok: false, erros }

  // Primeiro o horario: e ele que pode parar para pedir a confirmacao de
  // feriado, e nada pode ter sido gravado antes disso.
  if (e.nova) {
    const r = await remarcarAulaNoBanco(aulaId, e.nova, e.confirmouAlerta === true)
    if (!r.ok) return r
  }

  if (trocaProfessor) {
    const { error: erroProfessor } = await supabase
      .from('aulas')
      .update({ professor_id: e.professorId })
      .eq('id', aulaId)
    if (erroProfessor) {
      return {
        ok: false,
        erros: [
          e.nova
            ? `O dia e o horário mudaram, mas o professor não: ${erroProfessor.message}`
            : `Não foi possível trocar o professor: ${erroProfessor.message}`,
        ],
      }
    }
    // O link da chamada que ainda nao foi usado era do professor anterior.
    await supabase.from('presenca_tokens').delete().eq('aula_id', aulaId).is('usado_em', null)
  }

  if (trocaModalidade) {
    const { error: erroModalidade } = await supabase
      .from('aulas')
      .update({ modalidade: e.modalidade })
      .eq('id', aulaId)
    if (erroModalidade) {
      return { ok: false, erros: [`A modalidade não mudou: ${erroModalidade.message}`] }
    }
  }

  return { ok: true, turmaId: aula.turma_id, avisar: pedido.quando ? v.avisar : [] }
}
```

A criação/ajuste de sala do Meet para a aula que virou Online fica fora desta
task — é a Task 9 (Google), que decide se a aula precisa de link próprio e o
grava em `aulas.link_online`.

- [ ] **Step 2: tsc**

```bash
npx tsc --noEmit
```

Expected: erro apontando os chamadores de `editarAula`/`EdicaoDaAula` que
ainda não passam `modalidade` — tratados na Task 7.

- [ ] **Step 3: Commit**

Comitar junto com a Task 7, já que o chamador fica inconsistente sem ela —
pule o commit aqui e siga direto para a Task 7.

---

## Task 7: Página `/turmas/[id]/mudar` — remover "o que mudar", ação sempre completa

**Files:**
- Modify: `src/app/(app)/turmas/[id]/mudar/page.tsx`
- Modify: `src/app/(app)/turmas/[id]/mudar/PreviaDaMudanca.tsx`
- Modify: `src/app/(app)/turmas/[id]/mudar/acoes.ts`

- [ ] **Step 1: Ler `acoes.ts` para saber as assinaturas atuais**

Antes de editar, leia `src/app/(app)/turmas/[id]/mudar/acoes.ts` por completo
(ele não foi mostrado neste plano) e confirme os nomes exatos de
`editarEstaAula` e `mudarSerieDaTurma` — são as duas actions que `PreviaDaMudanca.tsx`
chama. Ajuste as assinaturas abaixo caso o arquivo real use nomes de
parâmetro diferentes dos aqui assumidos (`editarAula`/`mudarSerie` da camada
de dados, chamados por essas actions).

- [ ] **Step 2: Reescrever `page.tsx` sem o seletor "O que mudar"**

Substituir o conteúdo de `src/app/(app)/turmas/[id]/mudar/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obterTurma, opcoesDeTurma } from '@/dados/turmas'
import { obterAula } from '@/dados/aulas'
import { exigirGestora } from '@/dados/sessao'
import { aulasParaVarredura } from '@/dados/varredura'
import { agoraNaEscola } from '@/dominio/agenda/relogio'
import type { Acao, Escopo } from '@/dominio/agenda/varredura'
import { Botao } from '@/ui/Botao'
import { Cartao } from '@/ui/Cartao'
import { entradaClasse } from '@/ui/Campo'
import { PreviaDaMudanca, type DadosDaEdicao, type DadosDaSerie, type PedidoDeSaida } from './PreviaDaMudanca'

/**
 * Etapa 6a + "editar aula unificado" (30/10/2026): a previa de editar. A
 * gestora escolhe so o escopo (e a data, se for o caso); a acao de editar e
 * sempre "tudo" (quando, professor, servico, modalidade) — cada campo so
 * aparece habilitado quando a aula libera. Excluir e encerrar continuam
 * acessiveis por outros caminhos (ExcluirAula na aula, Encerrar turma na
 * tela da turma), fora deste fluxo.
 */

const ACAO_EDITAR: Acao = { tipo: 'editar', quando: true, professor: true, servico: true, modalidade: true }

const ESCOPOS: Record<Escopo, string> = {
  esta: 'Só esta aula',
  'a-partir': 'A partir de uma data',
  serie: 'A série inteira',
}

export default async function PaginaMudarTurma({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ escopo?: string; data?: string; aula?: string }>
}) {
  await exigirGestora()
  const { id } = await params
  const q = await searchParams
  const turma = await obterTurma(Number(id))
  if (!turma) notFound()

  const hoje = agoraNaEscola(new Date()).slice(0, 10)
  const aulaId = q.aula ? Number(q.aula) : undefined
  const escopo: Escopo =
    q.escopo && q.escopo in ESCOPOS && (q.escopo !== 'esta' || aulaId)
      ? (q.escopo as Escopo)
      : aulaId
        ? 'esta'
        : 'a-partir'
  const data = q.data && /^\d{4}-\d{2}-\d{2}$/.test(q.data) ? q.data : hoje
  const aulas = await aulasParaVarredura(turma.id, escopo, { aulaId, aPartirDe: data })

  let edicao: DadosDaEdicao | undefined
  let serie: DadosDaSerie | undefined
  let semAplicar: string | undefined

  if (escopo === 'esta' && aulaId) {
    const [aula, opcoes] = await Promise.all([obterAula(aulaId), opcoesDeTurma()])
    if (aula && aula.turma_id === turma.id) {
      const professores = opcoes.professores.some((p) => p.id === aula.professor_id)
        ? opcoes.professores
        : [{ id: aula.professor_id, nome: 'Professor atual (inativo)' }, ...opcoes.professores]
      edicao = {
        aulaId,
        inicio: String(aula.data_hora_inicio).slice(0, 16),
        fim: String(aula.data_hora_fim).slice(0, 16),
        professorId: aula.professor_id,
        professores,
        modalidade: aula.turma?.modalidade === 'Online' ? 'Online' : 'Presencial',
      }
    }
  } else if (turma.tipo_recorrencia !== 'Recorrente') {
    semAplicar = 'Turma de aula única: mude a aula pelo "Só esta aula", a partir da aula na agenda.'
  } else if (turma.status !== 'Ativa') {
    semAplicar = 'Esta turma está encerrada.'
  } else {
    const opcoes = await opcoesDeTurma()
    serie = {
      escopo,
      aPartirDe: data,
      diasSemana: turma.dias_semana,
      horarioInicio: turma.horario_inicio.slice(0, 5),
      horarioFim: turma.horario_fim.slice(0, 5),
      professorId: turma.professor_id,
      servicoId: turma.servico_id,
      modalidade: turma.modalidade,
      professores: opcoes.professores.some((p) => p.id === turma.professor_id)
        ? opcoes.professores
        : [{ id: turma.professor_id, nome: turma.professor?.nome ?? 'Professor atual' }, ...opcoes.professores],
      servicos: opcoes.servicos.map((s) => ({ id: s.id, nome: s.nome })),
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href={`/turmas/${turma.id}`} className="text-sm text-tinta-suave hover:text-destaque">
          ← {turma.nome}
        </Link>
        <h1 className="mt-1 text-3xl">Editar aula</h1>
        <p className="mt-1 text-tinta-suave">
          Mostra, aula por aula, o que aconteceria. Nada é gravado antes de você aplicar.
        </p>
      </header>

      <Cartao>
        <form className="flex flex-wrap items-end gap-4">
          {aulaId && <input type="hidden" name="aula" value={aulaId} />}
          <label className="flex flex-col gap-1 text-sm">
            Quais aulas
            <select name="escopo" defaultValue={escopo} className={entradaClasse}>
              {Object.entries(ESCOPOS)
                .filter(([k]) => k !== 'esta' || aulaId)
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </label>
          {escopo !== 'esta' && (
            <label className="flex flex-col gap-1 text-sm">
              A partir de
              <input type="date" name="data" defaultValue={data} className={entradaClasse} />
            </label>
          )}
          <Botao type="submit" aparencia="secundario">
            Ver prévia
          </Botao>
        </form>
      </Cartao>

      <PreviaDaMudanca
        key={`${escopo}:${data}:${aulaId ?? ''}`}
        aulas={aulas}
        acao={ACAO_EDITAR}
        escopo={escopo}
        edicao={edicao}
        turmaId={turma.id}
        saida={undefined}
        serie={serie}
        semAplicar={semAplicar}
      />
    </div>
  )
}
```

Note: `PedidoDeSaida` continua importado para o tipo de `saida` (sempre
`undefined` aqui), porque `PreviaDaMudanca` continua recebendo essa prop —
excluir/encerrar não passam mais por esta página, mas o componente mantém a
capacidade por ora (ver Task 8 sobre não remover esse código, só deixar de
alimentá-lo por aqui). Se o projeto preferir remover de vez o caminho de
saída desta página, isso é uma limpeza de escopo maior — não faça neste
plano; apenas pare de oferecer a UI que levava a ele (já não há seletor "o
que mudar" que aponte para excluir/encerrar).

`aula.turma?.modalidade` em `obterAula`: confirme em `src/dados/aulas.ts`
(linha 27-34, já lido) que `AulaComTurma.turma.modalidade` é `string` — o
cast para `'Online' | 'Presencial'` acima é necessário porque o tipo hoje é
`string`. Depois da Task 1, prefira trocar a leitura para `aula.modalidade`
direto (a aula já guarda a própria modalidade) em vez de `aula.turma?.modalidade`.
Ajuste a linha para:

```ts
        modalidade: aula.modalidade,
```

e exporte `modalidade` em `AulaComTurma` (`src/dados/aulas.ts`, Task 8 trata
isso — adiante o ajuste junto com a Task 8 para não duplicar edição do mesmo
arquivo).

- [ ] **Step 3: Commit (parcial, aguarda Task 8 para compilar)**

Não comitar ainda — `src/dados/aulas.ts` e `PreviaDaMudanca.tsx` precisam da
Task 8 para o projeto compilar. Siga direto para a Task 8.

---

## Task 8: `src/dados/aulas.ts` e `PreviaDaMudanca.tsx` — modalidade nos dados e no formulário

**Files:**
- Modify: `src/dados/aulas.ts`
- Modify: `src/app/(app)/turmas/[id]/mudar/PreviaDaMudanca.tsx`
- Modify: `src/app/(app)/turmas/[id]/mudar/acoes.ts`

- [ ] **Step 1: `AulaComTurma` ganha `modalidade` própria**

Em `src/dados/aulas.ts`, `AulaComTurma` (linha 12-35) e `SELECT_AULA` (linha 37-41):

```ts
export interface AulaComTurma {
  id: number
  turma_id: number
  google_calendar_event_id: string
  data_hora_inicio: string
  data_hora_fim: string
  status: StatusAula
  /** Remarcada (13/10/2026): o horário que a regra da turma deu a ela. */
  data_hora_original: string | null
  /** O dia que a turma considera para a aula: o original, se foi remarcada. */
  data_hora_referencia: string
  link_online: string | null
  observacao: string | null
  /** Etapa 2 (29/10/2026): quem da a aula; pode diferir do atual da turma. */
  professor_id: number
  /** Extensao de 30/10/2026: pode diferir da modalidade atual da turma. */
  modalidade: 'Presencial' | 'Online'
  turma: {
    id: number
    nome: string
    modalidade: string
    professor_id: number
    tipo_recorrencia: 'Recorrente' | 'Único'
    horario_fim: string
  } | null
}

const SELECT_AULA = `
  id, turma_id, google_calendar_event_id, data_hora_inicio, data_hora_fim,
  status, link_online, observacao, data_hora_original, data_hora_referencia, professor_id, modalidade,
  turma:turmas!turma_id (id, nome, modalidade, professor_id, tipo_recorrencia, horario_fim)
`
```

Confirme (com uma busca de texto, não edição) que não há outro lugar em
`src/dados/aulas.ts` que precise desse campo — a função `sincronizarAulas`
(linha 52+) grava aulas em lote via upsert e usa o trigger
`aula_herda_da_turma` para preencher `modalidade`, então não precisa inserir
o campo explicitamente ali.

- [ ] **Step 2: Ajustar `page.tsx` da Task 7 para `aula.modalidade`**

Já escrito corretamente na Task 7 (`modalidade: aula.modalidade`). Confirme
que ficou assim depois deste step.

- [ ] **Step 3: Atualizar `PreviaDaMudanca.tsx`**

Em `src/app/(app)/turmas/[id]/mudar/PreviaDaMudanca.tsx`:

`DadosDaEdicao` (linha 25-32):

```ts
export interface DadosDaEdicao {
  aulaId: number
  /** AAAA-MM-DDTHH:MM */
  inicio: string
  fim: string
  professorId: number
  professores: { id: number; nome: string }[]
  modalidade: 'Presencial' | 'Online'
}
```

`DadosDaSerie` (linha 38-49):

```ts
export interface DadosDaSerie {
  escopo: 'a-partir' | 'serie'
  aPartirDe: string
  diasSemana: number[]
  /** HH:MM */
  horarioInicio: string
  horarioFim: string
  professorId: number
  servicoId: number
  modalidade: 'Presencial' | 'Online'
  professores: { id: number; nome: string }[]
  servicos: { id: number; nome: string }[]
}
```

A chamada a `EditarEstaAula` (linha 200-207) deixa de passar `mudaQuando`/
`mudaProfessor` (a tela sempre tenta tudo; o próprio componente decide o que
mostrar olhando `aula.campos`):

```tsx
      {edicao && acao.tipo === 'editar' ? (
        <EditarEstaAula
          aula={v.aulas[0]}
          dados={edicao}
          aconteceu={respostas.aconteceu?.[edicao.aulaId]}
        />
      ) : saida ? (
```

A função `EditarEstaAula` (linha 225-357) passa a mostrar sempre os 4 campos,
escondendo dia/horário e modalidade quando a aula não libera (`aula.campos`
vindo da varredura, igual já funciona para professor). Substituir a função
inteira:

```tsx
/**
 * Etapa 6b + "editar aula unificado": aplicar a edicao de uma aula. Mostra os
 * 4 campos juntos; dia/horario e modalidade ficam ocultos quando a aula nao
 * libera (aula Realizada so corrige professor e servico, decisao 7/8). O
 * servidor confere tudo de novo antes de gravar.
 */
function EditarEstaAula({
  aula,
  dados,
  aconteceu,
}: {
  aula: AulaVarrida | undefined
  dados: DadosDaEdicao
  aconteceu: boolean | undefined
}) {
  const router = useRouter()
  const [data, setData] = useState(dados.inicio.slice(0, 10))
  const [horaInicio, setHoraInicio] = useState(dados.inicio.slice(11, 16))
  const [horaFim, setHoraFim] = useState(dados.fim.slice(11, 16))
  const [professorId, setProfessorId] = useState(dados.professorId)
  const [modalidade, setModalidade] = useState(dados.modalidade)
  const [alerta, setAlerta] = useState<string | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [feito, setFeito] = useState<{ nome: string; data: string }[] | null>(null)
  const [pendente, iniciar] = useTransition()

  const podeQuando = aula?.campos?.quando ?? false
  const podeModalidade = aula?.campos?.modalidade ?? false

  const mudouHorario =
    podeQuando && (data !== dados.inicio.slice(0, 10) || horaInicio !== dados.inicio.slice(11, 16) || horaFim !== dados.fim.slice(11, 16))
  const mudouProfessor = professorId !== dados.professorId
  const mudouModalidade = podeModalidade && modalidade !== dados.modalidade
  const pedido = { quando: mudouHorario, professor: mudouProfessor, modalidade: mudouModalidade }
  const bloqueio = errosDaEdicao(aula, pedido)
  const nadaMudou = !mudouHorario && !mudouProfessor && !mudouModalidade

  // Mexer no horario depois do aviso de feriado pede outra conferencia.
  const mudou = (f: () => void) => {
    f()
    setAlerta(null)
  }

  function aplicar() {
    setErros([])
    iniciar(async () => {
      try {
        const r = await editarEstaAula(dados.aulaId, {
          nova: mudouHorario ? { data, inicio: horaInicio, fim: horaFim } : null,
          professorId: mudouProfessor ? professorId : null,
          modalidade: mudouModalidade ? modalidade : null,
          aconteceu,
          confirmouAlerta: alerta !== null,
        })
        if (r.ok) {
          setFeito(r.avisar)
          router.refresh()
        } else if (r.alerta) setAlerta(r.alerta)
        else setErros(r.erros ?? ['Não foi possível mudar a aula.'])
      } catch {
        setErros(['Não foi possível mudar a aula agora. Tente de novo.'])
      }
    })
  }

  if (feito) {
    return (
      <Cartao>
        <p className="font-medium">Aula alterada.</p>
        <p className="mt-1 text-sm text-tinta-suave">A agenda do professor no Google acompanha em instantes.</p>
        {feito.length > 0 && (
          <p className="mt-2 text-sm">
            Avise quem vem repor: {feito.map((x) => x.nome).join(', ')}.
          </p>
        )}
        <div className="mt-4">
          <BotaoLink href={`/agenda/aulas/${dados.aulaId}`} aparencia="secundario">
            Ver a aula
          </BotaoLink>
        </div>
      </Cartao>
    )
  }

  return (
    <Cartao>
      <h2 className="text-xl">Aplicar nesta aula</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {podeQuando && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Dia</span>
              <input type="date" value={data} onChange={(e) => mudou(() => setData(e.target.value))} className={entradaClasse} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Início</span>
              <input type="time" value={horaInicio} onChange={(e) => mudou(() => setHoraInicio(e.target.value))} className={entradaClasse} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Término</span>
              <input type="time" value={horaFim} onChange={(e) => mudou(() => setHoraFim(e.target.value))} className={entradaClasse} />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Professor desta aula</span>
          <select value={professorId} onChange={(e) => setProfessorId(Number(e.target.value))} className={entradaClasse}>
            {dados.professores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        {podeModalidade && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Modalidade</span>
            <select
              value={modalidade}
              onChange={(e) => mudou(() => setModalidade(e.target.value as 'Presencial' | 'Online'))}
              className={entradaClasse}
            >
              <option value="Presencial">Presencial</option>
              <option value="Online">Online</option>
            </select>
          </label>
        )}
      </div>

      {!podeQuando && (
        <p className="mt-3 text-sm text-tinta-suave">
          Esta aula já aconteceu: dia, horário e modalidade não podem mudar. Só o professor e o serviço se corrigem.
        </p>
      )}
      {!nadaMudou && bloqueio.length > 0 && (
        <p className="mt-3 text-sm text-tinta-suave">{bloqueio[0]}</p>
      )}
      {alerta && (
        <div role="alert" className="mt-3 rounded-campo bg-alerta-suave px-4 py-3 text-sm">
          {alerta} Mudar mesmo assim?
        </div>
      )}
      {erros.length > 0 && (
        <ul role="alert" className="mt-3 flex flex-col gap-1 rounded-campo bg-erro-suave px-4 py-3 text-sm text-erro">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Botao type="button" disabled={pendente || nadaMudou || bloqueio.length > 0} onClick={aplicar}>
          {pendente ? 'Aplicando…' : alerta ? 'Sim, mudar' : 'Aplicar'}
        </Botao>
      </div>
    </Cartao>
  )
}
```

Note que o serviço não tem campo nesta função: a edição de "só esta aula" não
ganhou campo de serviço no formulário original (Task 6 também não adicionou
`servicoId` a `EdicaoDaAula`/`editarAula` — o spec não pediu trocar o serviço
de uma aula isolada, só dia/horário, professor e, agora, modalidade). Isso é
intencional: mantenha fora de `EdicaoDaAula`.

Adicionar o import de `errosDaEdicao` no topo do arquivo (se ainda não
estiver importado — confira a lista de imports existente antes de duplicar):

```ts
import {
  errosDaEdicao,
  planoDeSaida,
  varrer,
  type Acao,
  type AulaDaVarredura,
  type AulaVarrida,
  type Desfecho,
  type Escopo,
  type Respostas,
} from '@/dominio/agenda/varredura'
```

(já está importado — apenas confirme.)

Agora `AplicarNaSerie` (linha 465-618): adicionar o campo de modalidade junto
dos demais. No estado (linha 479-483):

```ts
  const [dias, setDias] = useState(dados.diasSemana)
  const [horaInicio, setHoraInicio] = useState(dados.horarioInicio)
  const [horaFim, setHoraFim] = useState(dados.horarioFim)
  const [professorId, setProfessorId] = useState(dados.professorId)
  const [servicoId, setServicoId] = useState(dados.servicoId)
  const [modalidade, setModalidade] = useState(dados.modalidade)
```

Em `mudanca` (linha 491-495):

```ts
  const mudanca: MudancaDaSerie = {
    ...(acao.quando && { quando: { dias_semana: dias, horario_inicio: horaInicio, horario_fim: horaFim } }),
    ...(acao.professor && { professor_id: professorId }),
    ...(acao.servico && { servico_id: servicoId }),
    ...(acao.modalidade && { modalidade_nova: modalidade }),
  }
```

No JSX, depois do bloco `{acao.servico && ( ... )}` (linha 587-598),
adicionar:

```tsx
        {acao.modalidade && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium">Modalidade</span>
            <select
              value={modalidade}
              onChange={(e) => setModalidade(e.target.value as 'Presencial' | 'Online')}
              className={entradaClasse}
            >
              <option value="Presencial">Presencial</option>
              <option value="Online">Online</option>
            </select>
          </label>
        )}
```

- [ ] **Step 4: Atualizar `acoes.ts`**

Leia `src/app/(app)/turmas/[id]/mudar/acoes.ts` por completo antes de editar
(não foi mostrado neste plano). Localize a action `editarEstaAula` (que chama
`editarAula` de `src/dados/edicao-aula.ts`) e ajuste sua assinatura de
parâmetro para aceitar e repassar `modalidade: 'Presencial' | 'Online' | null`,
seguindo o mesmo padrão já usado para `professorId`. Localize `mudarSerieDaTurma`
(que chama `mudarSerie` de `src/dados/divisao-turma.ts`) e confirme que ela já
repassa `mudanca: MudancaDaSerie` genericamente (sem desestruturar campo por
campo) — nesse caso nenhuma mudança é necessária ali, porque `modalidade_nova`
já viaja dentro do objeto `MudancaDaSerie` por tipagem (Task 4/5). Se a action
desestruturar campos manualmente, adicione `modalidade_nova` à lista.

- [ ] **Step 5: tsc**

```bash
npx tsc --noEmit
```

Expected: vazio.

- [ ] **Step 6: Lint**

```bash
npm run lint
```

Expected: os 5 problemas já conhecidos (semear.mjs, NavMobile, cobrancas/page,
Formulario, tipos) e nenhum novo.

- [ ] **Step 7: Rodar a suíte inteira**

```bash
npx vitest run
```

Expected: PASS em todos os ~417+ testes (os novos desta mudança inclusos).

- [ ] **Step 8: Commit**

```bash
git add src/dados/aulas.ts src/app/\(app\)/turmas/\[id\]/mudar/page.tsx src/app/\(app\)/turmas/\[id\]/mudar/PreviaDaMudanca.tsx src/app/\(app\)/turmas/\[id\]/mudar/acoes.ts
git commit -m "feat(turmas): tela de editar aula junta dia, professor, servico e modalidade"
```

---

## Task 9: Botão único "Editar aula" na tela da aula

**Files:**
- Modify: `src/app/(app)/agenda/aulas/[id]/ConteudoDaAula.tsx`
- Delete: `src/app/(app)/agenda/aulas/[id]/RemarcarAula.tsx`
- Modify: `src/app/(app)/agenda/acoes.ts` (remover `remarcarAula`, se não usada em outro lugar)

- [ ] **Step 1: Confirmar que `remarcarAula` (a action) não é usada em outro lugar**

```bash
grep -rn "remarcarAula\b" src --include="*.tsx" --include="*.ts"
```

Expected: só `RemarcarAula.tsx` (o componente que será removido) e a
declaração da action em `agenda/acoes.ts`. Se aparecer em outro lugar, NÃO
remova a action — apenas remova o componente e o botão, e pule o Step 3.

- [ ] **Step 2: Editar `ConteudoDaAula.tsx`**

Remover o import de `RemarcarAula` (linha 11) e o bloco que o renderiza
(linhas 271-288), substituindo pelo bloco único de edição:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listaDaAula, obterAula } from '@/dados/aulas'
import { linksDaAula } from '@/dados/links-da-aula'
import { tokenDaAula } from '@/dados/presencas'
import { LinkDeChamada } from './LinkDeChamada'
import { AvisarFalta } from './AvisarFalta'
import { EnviarLink } from './EnviarLink'
import { ExcluirAula } from './ExcluirAula'
import { CorrigirChamada } from './CorrigirChamada'
import { CancelarAviso } from '../../../reposicoes/CancelarAviso'
```

(remove a linha `import { RemarcarAula } from './RemarcarAula'`.)

Substituir o bloco das linhas 271-300 (o `div` com `RemarcarAula`/`ExcluirAula`
e o bloco "Mudar esta aula" logo abaixo) por um único bloco:

```tsx
      {ehGestora && aula.status !== 'Excluída' && aula.status !== 'Realizada' && (
        <div className="flex flex-wrap gap-3">
          <ExcluirAula aulaId={aula.id} quando={quando} />
        </div>
      )}

      {/* Botao unico (30/10/2026): escopo e todos os campos juntos na previa. */}
      {ehGestora && aula.status !== 'Excluída' && (
        <div>
          <BotaoLink href={`/turmas/${aula.turma_id}/mudar?aula=${aula.id}`} aparencia="secundario">
            Editar aula
          </BotaoLink>
        </div>
      )}
```

Note que o comentário da Etapa 6 (linha 290 original, "vale tambem para a
aula dada") já não se aplica mais do mesmo jeito — a nova página decide por
si mesma, via `varrer`, o que cada escopo libera (Task 7/8), então não há
mais necessidade de calcular `acao=professor` vs `acao=quando` na URL.

- [ ] **Step 3: Remover a action e o componente não usados**

Se o Step 1 confirmou que `remarcarAula` não é chamada em outro lugar:

```bash
rm "src/app/(app)/agenda/aulas/[id]/RemarcarAula.tsx"
```

E em `src/app/(app)/agenda/acoes.ts`, remover a função `remarcarAula` (leia o
arquivo antes de editar para localizar o bloco exato — não foi mostrado neste
plano). Confirme que `remarcarAulaNoBanco` (de `src/dados/remarcacao.ts`), que
`editarAula` (Task 6) continua usando, não é removida — só a action da UI.

- [ ] **Step 4: tsc, lint, testes**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
```

Expected: tsc vazio; lint com os 5 problemas conhecidos e nenhum novo; todos
os testes passam.

- [ ] **Step 5: Avisar sobre verificação visual**

Esta mudança troca botões numa tela — não há teste automatizado de UI. Avisar
o Lucas: "Preciso que você confira visualmente a tela da aula (`/agenda/aulas/[id]`)
depois desse commit: só deve aparecer 'Excluir esta aula' e 'Editar aula', e
o botão 'Editar aula' deve levar para a prévia já sem o seletor 'O que mudar'."

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/agenda/aulas/[id]/ConteudoDaAula.tsx" "src/app/(app)/agenda/acoes.ts"
git rm "src/app/(app)/agenda/aulas/[id]/RemarcarAula.tsx"
git commit -m "feat(agenda): um botao so para editar a aula, sem o modal de remarcar"
```

---

## Task 10: Teste de integração contra o banco real

**Files:**
- Create (temporário): `src/dados/editar-aula-modalidade.integracao.test.ts`

- [ ] **Step 1: Escrever o teste de integração**

Seguindo o padrão do CLAUDE.md (mês sem aula real, nomes `ZZ ...`, limpa tudo
no `afterAll`, roda fora da suíte normal). Criar
`src/dados/editar-aula-modalidade.integracao.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

vi.mock('server-only', () => ({}))

import { clienteAdmin } from './admin'
const admin = clienteAdmin()
vi.mock('./cliente', () => ({ clienteServidor: async () => admin }))

import { editarAula } from './edicao-aula'
import { mudarSerie } from './divisao-turma'

/**
 * Teste de integracao temporario: confere que aulas.modalidade e gravada e
 * propagada de verdade no banco remoto. Cenario em marco de 2031 (sem aula
 * real), nomes "ZZ ...". NAO entra na suite: apagar este arquivo apos rodar.
 */
describe('editar modalidade contra o banco real', () => {
  let turmaId: number
  let aulaId: number
  let professorId: number
  let servicoId: number

  beforeAll(async () => {
    const { data: professor } = await admin
      .from('professores')
      .select('id')
      .eq('ativo', true)
      .limit(1)
      .single()
    professorId = professor!.id
    const { data: servico } = await admin.from('servicos').select('id').eq('ativo', true).limit(1).single()
    servicoId = servico!.id

    const { data: turma } = await admin
      .from('turmas')
      .insert({
        nome: 'ZZ Teste Modalidade',
        tipo_recorrencia: 'Recorrente',
        frequencia: 'Semanal',
        intervalo: 1,
        dias_semana: [1],
        horario_inicio: '10:00',
        horario_fim: '11:00',
        data_inicio: '2031-03-03',
        data_fim: '2031-04-30',
        professor_id: professorId,
        servico_id: servicoId,
        modalidade: 'Presencial',
        status: 'Ativa',
      })
      .select('id')
      .single()
    turmaId = turma!.id

    const { data: aula } = await admin
      .from('aulas')
      .insert({
        turma_id: turmaId,
        data_hora_inicio: '2031-03-03T13:00:00Z',
        data_hora_fim: '2031-03-03T14:00:00Z',
        data_hora_referencia: '2031-03-03T13:00:00Z',
        status: 'Agendada',
        google_calendar_event_id: 'zz-teste-modalidade',
      })
      .select('id, modalidade')
      .single()
    aulaId = aula!.id
    expect(aula!.modalidade).toBe('Presencial') // heranca do gatilho
  })

  afterAll(async () => {
    await admin.from('aulas').delete().eq('turma_id', turmaId)
    await admin.from('turmas').delete().eq('id', turmaId)
    const { data: resto } = await admin.from('aulas').select('id').eq('turma_id', turmaId)
    expect(resto ?? []).toHaveLength(0)
  })

  it('editar so esta aula grava so aulas.modalidade', async () => {
    const r = await editarAula(aulaId, {
      nova: null,
      professorId: null,
      modalidade: 'Online',
    })
    expect(r.ok).toBe(true)

    const { data: aula } = await admin.from('aulas').select('modalidade').eq('id', aulaId).single()
    expect(aula!.modalidade).toBe('Online')
    const { data: turma } = await admin.from('turmas').select('modalidade').eq('id', turmaId).single()
    expect(turma!.modalidade).toBe('Presencial') // a turma nao mudou
  })

  it('mudar a serie propaga modalidade para turma e aulas', async () => {
    const r = await mudarSerie(turmaId, 'serie', '2031-03-03', { modalidade_nova: 'Online' }, {})
    expect(r.ok).toBe(true)

    const { data: turma } = await admin.from('turmas').select('modalidade').eq('id', turmaId).single()
    expect(turma!.modalidade).toBe('Online')
  })
})
```

- [ ] **Step 2: Rodar o teste pelo PowerShell**

```powershell
npx vitest run src/dados/editar-aula-modalidade.integracao.test.ts
```

Expected: PASS nos dois testes. Se falhar, investigue (não force passar) —
pode indicar erro na migração ou no trigger da Task 1, ou na gravação da Task
5/6.

- [ ] **Step 3: Confirmar que não ficou resíduo e apagar o arquivo**

```bash
node scripts/consultar.mjs turmas "id,nome" | grep "ZZ Teste"
```

Expected: nenhuma linha (o `afterAll` já limpou). Depois:

```bash
rm src/dados/editar-aula-modalidade.integracao.test.ts
```

Não commitar este arquivo.

---

## Task 11 (Google — isolada, com cuidado): evento avulso e sala do Meet por aula isolada

**Files:**
- Modify: `src/dominio/agenda/evento-google.ts`
- Modify: `src/dominio/agenda/evento-google.test.ts`
- Modify: `src/dados/evento-da-turma.ts`
- Modify: `src/dados/edicao-aula.ts` (de novo, para acionar a sala)

**Antes de começar esta task, pare e avise o Lucas.** Esta é a parte mais
arriscada do plano: toca o código que já causou um bug grave (a flag
`GOOGLE_CALENDAR_ATIVO` fazendo duas coisas, ver CLAUDE.md). Mostre o diff
proposto antes de aplicar no banco de produção, e confirme que o Kelly→Diego
(ou outro par de contas de teste) vai poder conferir visualmente a mudança no
Google Agenda antes de considerar pronto, como nas etapas 6b/6d anteriores.

- [ ] **Step 1: Escrever os testes que falham em `evento-google.test.ts`**

Adicionar a `src/dominio/agenda/evento-google.test.ts`, no `describe('temEventoProprio', ...)`:

```ts
it('tem evento proprio quando a modalidade difere da turma', () => {
  expect(temEventoProprio({ ...aula, modalidade: 'Online' }, 3, 'Presencial')).toBe(true)
})

it('nao conta diferenca de modalidade se a aula foi excluida', () => {
  expect(temEventoProprio({ ...aula, modalidade: 'Online', status: 'Excluída' }, 3, 'Presencial')).toBe(false)
})
```

Ajuste o fixture `aula` usado nesse describe (procure a declaração local no
topo do bloco de teste) para incluir `modalidade: 'Presencial'` como padrão,
e confirme a assinatura esperada de `temEventoProprio` no próximo step antes
de rodar.

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npx vitest run src/dominio/agenda/evento-google.test.ts
```

Expected: FAIL — `temEventoProprio` ainda não aceita o terceiro parâmetro
nem considera `modalidade`.

- [ ] **Step 3: Implementar em `evento-google.ts`**

Em `src/dominio/agenda/evento-google.ts`, ajustar `temEventoProprio` (linha 153-159):

```ts
/**
 * A aula sai da serie e ganha um evento so dela: a remarcada (13/10/2026),
 * no dia novo; a com outro professor (etapa 6b, 29/10/2026), na agenda desse
 * professor; e a com modalidade diferente da turma (30/10/2026), para ter o
 * link certo. O dia de sempre vira EXDATE da serie.
 */
export function temEventoProprio(
  aula: { data_hora_original: string | null; professor_id: number; status: StatusAula; modalidade: 'Presencial' | 'Online' },
  professorDaTurma: number,
  modalidadeDaTurma: 'Presencial' | 'Online',
): boolean {
  if (aula.status === 'Excluída') return false
  return aula.data_hora_original !== null || aula.professor_id !== professorDaTurma || aula.modalidade !== modalidadeDaTurma
}
```

Atualizar `exdatesDoEvento` (linha 131-146): o chamador em `evento-da-turma.ts`
(linha 157) passa `remarcada: temEventoProprio(a, turma.professor_id)` — vai
precisar do terceiro argumento também lá (Step 5).

Em `descricaoDoEvento` (linha 249-266), a descrição já lê `turma.modalidade` e
`turma.link_videochamada` do objeto `TurmaDoEvento` passado — isso já
funciona para o evento avulso, porque `eventoSemAlunos` (Step 5) vai passar a
modalidade/link **da aula**, não da turma, quando houver diferença. Nenhuma
mudança necessária em `descricaoDoEvento` nem em `TurmaDoEvento` além do que
já existe (`modalidade` e `link_videochamada` já são campos genéricos desse
tipo).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```bash
npx vitest run src/dominio/agenda/evento-google.test.ts
```

Expected: PASS.

- [ ] **Step 5: Ajustar `sincronizarAvulsos` em `evento-da-turma.ts`**

Leia `src/dados/evento-da-turma.ts` por completo nas seções que chamam
`temEventoProprio` (linhas 150-160 e 211-266, já mostradas neste plano) antes
de editar. Ajustar:

1. A consulta de aulas de `sincronizarAvulsos` (linha 186-194) e de
   `exdatesDaTurma` (a função que monta o array passado a `exdatesDoEvento`,
   linha ~140-160) para selecionar também `modalidade, link_online` de cada
   aula, e trocar o filtro `.or(...)` (linha 192-194) para incluir
   `modalidade.neq.${turma.modalidade}`:

```ts
    .or(
      `data_hora_original.not.is.null,google_evento_avulso_id.not.is.null,professor_id.neq.${turma.professor_id},modalidade.neq.${turma.modalidade}`,
    )
```

2. Todo lugar que chama `temEventoProprio(a, turma.professor_id)` passa a
   chamar `temEventoProprio(a, turma.professor_id, turma.modalidade)`.

3. No corpo de `sincronizarAvulsos` (linha 234-252), ao montar o evento
   avulso via `eventoSemAlunos(turma, professor?.email ?? null, link)`, trocar
   para usar a modalidade e o link da própria aula quando diferentes:

```ts
      const original = a.data_hora_original ? String(a.data_hora_original).slice(0, 16) : null
      const linkDoEvento = a.modalidade === turma.modalidade ? link : (a.link_online ?? null)
      const turmaDoEvento = a.modalidade === turma.modalidade ? turma : { ...turma, modalidade: a.modalidade }
      const r = await sincronizarEvento({
        ...eventoSemAlunos(turmaDoEvento, professor?.email ?? null, linkDoEvento),
        tipo_recorrencia: 'Único',
        data_unica: inicio.slice(0, 10),
        frequencia: null,
        intervalo: null,
        dias_semana: [],
        data_inicio: null,
        data_fim: null,
        exdates: [],
        horario_inicio: inicio.slice(11, 16),
        horario_fim: String(a.data_hora_fim).slice(11, 16),
        remarcadaDe: original,
        alunos: alunosNaData(mats, (original ?? inicio).slice(0, 10)),
        google_calendar_id: agenda,
        evento_id: eventoId,
      })
```

Ajuste os tipos locais (`type TurmaLida` e o tipo inline do `.select` em
`aulas`) para incluir `modalidade` e `link_online` no retorno da consulta de
aulas.

- [ ] **Step 6: Criar sala nova quando a aula isolada precisa e a turma não tem**

Em `src/dados/edicao-aula.ts`, na Task 6 o bloco `if (trocaModalidade)` grava
`aulas.modalidade`. Estender esse bloco para, quando a modalidade nova for
`'Online'` e a aula ainda não tem `link_online`, resolver o link: usar o da
turma se ela já tiver (`turmas.google_meet_sala`/`link_videochamada`), ou
criar uma sala nova reaproveitando `criarSala` de `@/agenda/meet` (a mesma
função usada em `prepararSala`, `src/dados/evento-da-turma.ts` linha 665) e
gravar em `aulas.link_online`:

```ts
  if (trocaModalidade) {
    const { error: erroModalidade } = await supabase
      .from('aulas')
      .update({ modalidade: e.modalidade })
      .eq('id', aulaId)
    if (erroModalidade) {
      return { ok: false, erros: [`A modalidade não mudou: ${erroModalidade.message}`] }
    }

    if (e.modalidade === 'Online') {
      const { data: aulaComTurma } = await supabase
        .from('aulas')
        .select(
          'link_online, turma:turmas!turma_id (link_videochamada, google_meet_sala, professor:professores!professor_id (email))',
        )
        .eq('id', aulaId)
        .maybeSingle()
      const turmaDaAula = aulaComTurma?.turma as unknown as {
        link_videochamada: string | null
        google_meet_sala: string | null
        professor: { email: string | null } | null
      } | null
      const jaTemLink = aulaComTurma?.link_online ?? turmaDaAula?.link_videochamada
      if (!jaTemLink) {
        const r = await criarSala(turmaDaAula?.professor?.email ?? null)
        if (r.ok) {
          await supabase.from('aulas').update({ link_online: r.link }).eq('id', aulaId)
        }
        // Falhar aqui nao impede a troca de modalidade: so fica sem link ainda.
      } else if (!aulaComTurma?.link_online) {
        await supabase.from('aulas').update({ link_online: jaTemLink }).eq('id', aulaId)
      }
    }
  }
```

Adicionar o import no topo de `src/dados/edicao-aula.ts`:

```ts
import { criarSala } from '@/agenda/meet'
```

- [ ] **Step 7: tsc, lint, testes**

```bash
npx tsc --noEmit
npm run lint
npx vitest run
```

Expected: tsc vazio; lint com os 5 problemas conhecidos e nenhum novo; todos
os testes passam.

- [ ] **Step 8: Teste de integração manual com o Google**

Esta parte não tem teste automatizado contra o Google real (as chamadas de
API são mockadas nos testes unitários). Avisar o Lucas: "Preciso que você
confira no Google Agenda de um professor de teste: mude a modalidade de uma
aula isolada para Online numa turma Presencial sem sala, confirme que nasce
um evento avulso com link do Meet e o professor como coorganizador, e depois
volte a Presencial e confirme que o evento avulso some e a aula volta para a
série recorrente."

- [ ] **Step 9: Commit**

```bash
git add src/dominio/agenda/evento-google.ts src/dominio/agenda/evento-google.test.ts src/dados/evento-da-turma.ts src/dados/edicao-aula.ts
git commit -m "feat(agenda): aula com modalidade diferente da turma ganha evento e sala propria no Google"
```

---

## Self-Review Notes (preenchido durante a escrita do plano)

- **Cobertura do spec:** seção 1 (entrada) → Task 9; seção 2 (página sem
  seletor) → Task 7; seção 3 (coluna + herança/propagação) → Task 1, 4, 5;
  seção 4 (formulário unificado com exceção de aula Realizada) → Task 8;
  seção 5 (pontos de código) → Tasks 2, 4, 6, 7, 8. A parte de Google (sala,
  evento avulso) ficou isolada na Task 11, por decisão explícita do Lucas.
- **Placeholders:** nenhum "TBD"/"implementar depois" deixado; onde o plano
  pede "leia o arquivo antes de editar" (acoes.ts em algumas tasks), é porque
  esses arquivos não foram mostrados nesta sessão — a instrução é concreta
  (qual função procurar, o que ajustar) mesmo sem o código exato na frente.
- **Consistência de tipos:** `modalidade_nova` (em `MudancaDaSerie`) é
  distinto de `modalidade` (em `AulaDaDivisao`/`AulaDividida`/`TurmaDaDivisao`)
  de propósito, para não colidir nomes dentro do mesmo arquivo — usado de
  forma consistente nas Tasks 4, 5 e 8.
