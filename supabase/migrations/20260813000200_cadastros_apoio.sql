-- Cadastros de apoio. Campos marcados [INFERIDO] no spec, secao 4.1, sao
-- nulaveis para permitir ajuste sem migration destrutiva apos validacao.

create table public.cidades (
  id bigint generated always as identity primary key,
  nome text not null,
  uf char(2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nome, uf)
);

create table public.escolas (
  id bigint generated always as identity primary key,
  nome text not null,
  cidade_id bigint references public.cidades (id) on delete set null,
  endereco text,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.anos_escolares (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.anos_escolares.ordem is
  'Ordena "9º ano" depois de "1º ano". Ordenacao alfabetica nao serve.';

create table public.materias (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.servicos (
  id bigint generated always as identity primary key,
  nome text not null,
  descricao text,
  valor_padrao numeric(12, 2) not null check (valor_padrao >= 0),
  permite_materia boolean not null default true,
  permite_escola boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Requisitos Operacionais 6.2: o valor cobrado e o do servico NA DATA DA AULA.
-- Sem historico, um reajuste reescreveria cobrancas e repasses ja fechados.
create table public.servico_valor_historico (
  id bigint generated always as identity primary key,
  servico_id bigint not null references public.servicos (id) on delete cascade,
  valor numeric(12, 2) not null check (valor >= 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  created_at timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create index on public.servico_valor_historico (servico_id, vigencia_inicio desc);

create table public.contas (
  id bigint generated always as identity primary key,
  nome text not null,
  tipo public.tipo_conta not null default 'Banco',
  banco text,
  chave_pix text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feriados (
  id bigint generated always as identity primary key,
  data date not null,
  nome text not null,
  abrangencia public.abrangencia_feriado not null default 'Nacional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data, nome)
);

create trigger tocar_updated_at before update on public.cidades
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.escolas
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.anos_escolares
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.materias
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.servicos
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.contas
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.feriados
  for each row execute function public.tocar_updated_at();
