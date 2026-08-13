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
