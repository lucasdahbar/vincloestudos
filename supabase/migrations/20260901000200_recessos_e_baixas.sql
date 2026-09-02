-- Rodada 2, parte 2: as duas entidades novas do documento.

-- ── C2: periodos de recesso escolar, por escola ────────────────────────────
-- Diferente de feriado: feriado e uma data do pais/estado/municipio e vale para
-- todo mundo; recesso e um intervalo do calendario de UMA escola. Por isso
-- tabela propria, com periodo, em vez de linhas soltas em `feriados`.
create table public.recessos_escola (
  id bigint generated always as identity primary key,
  escola_id bigint not null references public.escolas (id) on delete cascade,
  descricao text not null check (length(trim(descricao)) > 0),
  data_inicio date not null,
  data_fim date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periodo_coerente check (data_fim >= data_inicio)
);

create index on public.recessos_escola (escola_id, data_inicio);

create trigger tocar_updated_at before update on public.recessos_escola
  for each row execute function public.tocar_updated_at();

alter table public.recessos_escola enable row level security;

create policy "gestora total" on public.recessos_escola for all
  using (public.e_gestora()) with check (public.e_gestora());

-- O professor precisa enxergar o recesso para entender por que a aula sumiu.
create policy "professor le" on public.recessos_escola
  for select to authenticated using (true);

-- ── P3 e P4: baixas de uma conta a pagar ───────────────────────────────────
-- Analoga a `recebimentos` do lado das cobrancas: uma conta pode ser quitada em
-- mais de uma vez, e o pagamento pode nem sair da conta da empresa (P4 — o
-- responsavel paga o professor direto).
create type public.origem_baixa as enum (
  'Conta própria',
  'Pago por responsável',
  'Outro'
);

create table public.baixas_conta_pagar (
  id bigint generated always as identity primary key,
  conta_pagar_id bigint not null
    references public.contas_pagar_professor (id) on delete cascade,
  valor numeric(12, 2) not null check (valor > 0),
  data date not null default current_date,
  origem public.origem_baixa not null,
  conta_id bigint references public.contas (id) on delete restrict,
  responsavel_id bigint references public.responsaveis (id) on delete restrict,
  forma_pagamento public.forma_pagamento,
  observacao text,
  registrado_por text,
  created_at timestamptz not null default now(),

  -- P4: os dois campos sao mutuamente exclusivos, e cada origem exige o seu.
  -- No banco, e nao so no formulario: uma baixa sem origem rastreavel nao serve
  -- para o relatorio de pagamentos feitos fora da conta da empresa.
  constraint origem_coerente check (
    case origem
      when 'Conta própria' then conta_id is not null and responsavel_id is null
      when 'Pago por responsável' then responsavel_id is not null and conta_id is null
      else conta_id is null and responsavel_id is null
    end
  )
);

create index on public.baixas_conta_pagar (conta_pagar_id);

alter table public.baixas_conta_pagar enable row level security;

-- Dado financeiro: so a gestora, no mesmo criterio de `recebimentos`.
create policy "gestora total" on public.baixas_conta_pagar for all
  using (public.e_gestora()) with check (public.e_gestora());
