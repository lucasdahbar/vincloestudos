create table public.turmas (
  id bigint generated always as identity primary key,
  nome text not null,
  servico_id bigint not null references public.servicos (id) on delete restrict,
  materia_id bigint references public.materias (id) on delete restrict,
  escola_id bigint references public.escolas (id) on delete restrict,
  ano_escolar_id bigint not null references public.anos_escolares (id) on delete restrict,
  professor_id bigint not null references public.professores (id) on delete restrict,
  modalidade public.modalidade not null,
  dias_semana smallint[] not null default '{}',
  horario_inicio time not null,
  horario_fim time not null,
  google_calendar_event_id text unique,
  status public.status_turma not null default 'Ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint horario_coerente check (horario_fim > horario_inicio),
  constraint dias_validos check (
    dias_semana <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  constraint ativa_exige_dia check (
    status <> 'Ativa' or array_length(dias_semana, 1) >= 1
  )
);

comment on column public.turmas.nome is
  'Gerado por concatenacao (Adendo v1.1, 5.2). Nao e unico: duas turmas podem ter a mesma composicao em horarios diferentes.';
comment on column public.turmas.dias_semana is
  'Mesmo indice de Date.getDay(): 0 = domingo.';

create index on public.turmas (professor_id);
create index on public.turmas (status);

-- A condicionalidade de materia/escola depende do servico, entao vive em trigger,
-- nao em CHECK (que nao pode consultar outra tabela).
create or replace function public.validar_condicionais_turma()
returns trigger
language plpgsql
as $$
declare
  s record;
begin
  select permite_materia, permite_escola into s
    from public.servicos where id = new.servico_id;

  if s.permite_materia and new.materia_id is null then
    raise exception 'O serviço desta turma exige matéria.';
  end if;
  if not s.permite_materia and new.materia_id is not null then
    raise exception 'O serviço desta turma não usa matéria.';
  end if;
  if s.permite_escola and new.escola_id is null then
    raise exception 'O serviço desta turma exige escola.';
  end if;
  if not s.permite_escola and new.escola_id is not null then
    raise exception 'O serviço desta turma não usa escola.';
  end if;

  return new;
end;
$$;

create trigger validar_condicionais
  before insert or update on public.turmas
  for each row execute function public.validar_condicionais_turma();

create table public.matriculas (
  id bigint generated always as identity primary key,
  aluno_id bigint not null references public.alunos (id) on delete restrict,
  turma_id bigint not null references public.turmas (id) on delete restrict,
  data_inicio date not null default current_date,
  data_fim date,
  flag_reposicao boolean not null default false,
  status public.status_matricula not null default 'Ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint periodo_coerente check (data_fim is null or data_fim > data_inicio)
);

comment on column public.matriculas.flag_reposicao is
  'Matricula pontual para cumprir reposicao em outra turma. NUNCA entra na base de calculo de cobranca (Operacionais 3.2 e 6.3).';

create index on public.matriculas (aluno_id);
create index on public.matriculas (turma_id);
create index on public.matriculas (status) where status = 'Ativa';

create trigger tocar_updated_at before update on public.turmas
  for each row execute function public.tocar_updated_at();
create trigger tocar_updated_at before update on public.matriculas
  for each row execute function public.tocar_updated_at();
