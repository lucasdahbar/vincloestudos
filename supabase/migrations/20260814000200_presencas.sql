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
