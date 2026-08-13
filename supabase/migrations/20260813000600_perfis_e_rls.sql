create table public.perfis (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel public.papel_usuario not null default 'professor',
  professor_id bigint references public.professores (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tocar_updated_at before update on public.perfis
  for each row execute function public.tocar_updated_at();

create or replace function public.e_gestora()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
     where usuario_id = auth.uid() and papel = 'gestora'
  );
$$;

create or replace function public.professor_do_usuario()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select professor_id from public.perfis where usuario_id = auth.uid();
$$;

alter table public.perfis enable row level security;

create policy "usuario le o proprio perfil" on public.perfis
  for select using (usuario_id = auth.uid() or public.e_gestora());
create policy "gestora administra perfis" on public.perfis
  for all using (public.e_gestora()) with check (public.e_gestora());

-- Cadastros: gestora escreve, professor apenas le (precisa dos nomes na agenda).
do $$
declare
  t text;
begin
  foreach t in array array[
    'cidades', 'escolas', 'anos_escolares', 'materias', 'servicos',
    'servico_valor_historico', 'contas', 'feriados', 'professores',
    'professor_percentual_historico', 'responsaveis', 'alunos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "gestora total" on public.%I for all
         using (public.e_gestora()) with check (public.e_gestora())', t);
    execute format(
      'create policy "autenticado le" on public.%I for select
         to authenticated using (true)', t);
  end loop;
end;
$$;

-- Dados financeiros do professor nao sao visiveis a outros professores.
drop policy "autenticado le" on public.professores;
create policy "professor le colegas sem financeiro" on public.professores
  for select to authenticated using (true);
revoke select on public.professor_percentual_historico from authenticated;
drop policy "autenticado le" on public.professor_percentual_historico;

alter table public.turmas enable row level security;
create policy "gestora total" on public.turmas for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "professor le suas turmas" on public.turmas for select
  to authenticated using (professor_id = public.professor_do_usuario());

alter table public.matriculas enable row level security;
create policy "gestora total" on public.matriculas for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "professor le matriculas de suas turmas" on public.matriculas for select
  to authenticated using (
    exists (
      select 1 from public.turmas t
       where t.id = matriculas.turma_id
         and t.professor_id = public.professor_do_usuario()
    )
  );
