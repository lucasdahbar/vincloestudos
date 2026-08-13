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
