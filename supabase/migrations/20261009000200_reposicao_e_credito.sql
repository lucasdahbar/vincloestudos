-- Rodada 3: regra de reposicoes da gestora (09/10/2026).
--
-- Resumo da regra: a ausencia de um aluno numa aula (avisada ou nao) vira uma
-- pendencia de reposicao. Se a reposicao nao acontecer — porque a gestora ja
-- disse que nao haveria, ou porque o aluno desistiu depois —, a gestora decide
-- se a aula e cobrada e, se for, se o professor recebe por ela ("desistencia
-- paga"). Nao cobrar uma aula que ja foi cobrada gera credito ao responsavel.

-- ── Pendencia: de onde veio e o que a gestora decidiu ─────────────────────
create type public.origem_ausencia as enum ('Aviso', 'Falta');

alter table public.pendencias_reposicao
  add column origem public.origem_ausencia not null default 'Falta',
  -- Nulos ate a decisao. So fazem sentido com status Desistida.
  add column cobrar boolean,
  add column pagar_professor boolean,
  add column decidido_em timestamptz,
  add constraint decisao_coerente check (
    (status <> 'Desistida' and cobrar is null and pagar_professor is null)
    or (status = 'Desistida' and cobrar is not null
        -- Professor so recebe por aula que foi cobrada.
        and (cobrar or pagar_professor is not true))
  );

comment on column public.pendencias_reposicao.origem is
  'Aviso: a gestora registrou antes que o aluno nao viria. Falta: o professor
   marcou a ausencia na chamada.';

-- Pendencias desistidas antes desta regra: a aula ja foi tratada como cobrada
-- (a geracao de cobranca nunca as excluiu) e o professor nao recebeu.
update public.pendencias_reposicao
  set cobrar = true, pagar_professor = false, decidido_em = updated_at
  where status = 'Desistida';

-- ── Cobranca: a reposicao entra, com valor zero ou com a diferenca ─────────
-- A regra pede o item da reposicao na cobranca, com R$ 0,00 quando a turma
-- de destino nao for mais cara.
alter table public.itens_cobranca drop constraint itens_cobranca_valor_original_check;
alter table public.itens_cobranca
  add constraint itens_cobranca_valor_original_check check (valor_original >= 0);

-- ── Pagamento do professor: item sem presenca ("desistencia paga") ─────────
alter table public.itens_conta_pagar_professor
  alter column presenca_id drop not null,
  add column pendencia_id bigint unique
    references public.pendencias_reposicao (id) on delete restrict,
  add constraint uma_origem check ((presenca_id is null) <> (pendencia_id is null));

-- ── Credito do responsavel ─────────────────────────────────────────────────
create table public.creditos (
  id bigint generated always as identity primary key,
  responsavel_id bigint not null references public.responsaveis (id) on delete restrict,
  aluno_id bigint references public.alunos (id) on delete restrict,
  -- Uma desistencia gera no maximo um credito.
  pendencia_id bigint unique references public.pendencias_reposicao (id) on delete restrict,
  valor numeric(12, 2) not null check (valor > 0),
  descricao text not null,
  created_at timestamptz not null default now()
);

create index on public.creditos (responsavel_id);

create type public.uso_credito as enum ('Abatimento', 'Devolução');

-- O credito pode ser usado em partes; o saldo e o valor menos os usos.
create table public.usos_credito (
  id bigint generated always as identity primary key,
  credito_id bigint not null references public.creditos (id) on delete restrict,
  tipo public.uso_credito not null,
  valor numeric(12, 2) not null check (valor > 0),
  data date not null default current_date,
  -- Abatimento: o recebimento que quitou parte da cobranca.
  recebimento_id bigint unique references public.recebimentos (id) on delete cascade,
  -- Devolucao: de qual conta saiu o dinheiro, quando se sabe.
  conta_id bigint references public.contas (id) on delete restrict,
  observacao text,
  registrado_por text,
  created_at timestamptz not null default now(),
  constraint uso_coerente check (
    (tipo = 'Abatimento' and recebimento_id is not null)
    or (tipo = 'Devolução' and recebimento_id is null)
  )
);

create index on public.usos_credito (credito_id);

-- Abater credito numa cobranca e um recebimento que nao passa por conta
-- bancaria: reaproveita a quitacao (saldo, Parcial, Quitada) como esta.
alter table public.recebimentos alter column conta_id drop not null;
alter table public.recebimentos
  add constraint conta_ou_credito check (
    conta_id is not null or forma_pagamento = 'Crédito'
  );

alter table public.creditos enable row level security;
create policy "gestora total" on public.creditos for all
  using (public.e_gestora()) with check (public.e_gestora());

alter table public.usos_credito enable row level security;
create policy "gestora total" on public.usos_credito for all
  using (public.e_gestora()) with check (public.e_gestora());
