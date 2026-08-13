create table public.professores (
  id bigint generated always as identity primary key,
  nome text not null,
  percentual_repasse numeric(5, 2) not null
    check (percentual_repasse >= 0 and percentual_repasse <= 100),
  telefone text,
  email text,
  cpf text,
  chave_pix text,
  ativo boolean not null default true,
  usuario_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.professores.usuario_id is
  'Liga o professor a uma conta de login. Nulo para professor sem acesso ao sistema.';

-- Requisitos Operacionais 8.2: o repasse usa o percentual VIGENTE NA DATA DA AULA.
create table public.professor_percentual_historico (
  id bigint generated always as identity primary key,
  professor_id bigint not null references public.professores (id) on delete cascade,
  percentual numeric(5, 2) not null check (percentual >= 0 and percentual <= 100),
  vigencia_inicio date not null,
  vigencia_fim date,
  created_at timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create index on public.professor_percentual_historico (professor_id, vigencia_inicio desc);

create table public.responsaveis (
  id bigint generated always as identity primary key,
  nome text not null,
  telefone text,
  email text,
  cpf text,
  endereco text,
  cidade_id bigint references public.cidades (id) on delete set null,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alunos (
  id bigint generated always as identity primary key,
  nome text not null,
  responsavel_id bigint not null references public.responsaveis (id) on delete restrict,
  escola_id bigint references public.escolas (id) on delete set null,
  data_nascimento date,
  telefone text,
  email text,
  observacao text,
  ativo boolean not null default true,
  destinatario_notificacao public.destinatario_notificacao not null default 'Responsável',
  canal_notificacao public.canal_notificacao not null default 'WhatsApp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.alunos is
  'Sem campo de ano escolar: o ano e definido pela Turma em que o aluno se matricula (Adendo v1.1, Ajuste 3).';

create index on public.alunos (responsavel_id);

create trigger tocar_updated_at before update on public.professores
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.responsaveis
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.alunos
  for each row execute function public.tocar_updated_at();
