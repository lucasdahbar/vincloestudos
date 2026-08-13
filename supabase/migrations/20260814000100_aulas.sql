-- Cada ocorrencia de uma turma. Materializada a partir da recorrencia da turma
-- ou lida do Google Calendar; nunca criada a mao pela gestora, exceto ajuste
-- pontual de status (Modulos Operacionais 4.2).

create type public.status_aula as enum ('Agendada', 'Realizada', 'Cancelada', 'Feriado');

create table public.aulas (
  id bigint generated always as identity primary key,
  turma_id bigint not null references public.turmas (id) on delete restrict,
  google_calendar_event_id text not null unique,
  data_hora_inicio timestamptz not null,
  data_hora_fim timestamptz not null,
  status public.status_aula not null default 'Agendada',
  link_online text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint horario_coerente check (data_hora_fim > data_hora_inicio)
);

comment on column public.aulas.google_calendar_event_id is
  'Chave de idempotencia da sincronizacao. O provedor local usa o formato
   local:t<turma_id>:<ISO>. Trocar para o Google Calendar nao duplica aula
   porque o upsert e por esta coluna.';

create index on public.aulas (turma_id, data_hora_inicio);
create index on public.aulas (data_hora_inicio);
create index on public.aulas (status);

create trigger tocar_updated_at before update on public.aulas
  for each row execute function public.tocar_updated_at();

alter table public.aulas enable row level security;

create policy "gestora total" on public.aulas for all
  using (public.e_gestora()) with check (public.e_gestora());

create policy "professor le aulas de suas turmas" on public.aulas for select
  to authenticated using (
    exists (
      select 1 from public.turmas t
       where t.id = aulas.turma_id
         and t.professor_id = public.professor_do_usuario()
    )
  );
