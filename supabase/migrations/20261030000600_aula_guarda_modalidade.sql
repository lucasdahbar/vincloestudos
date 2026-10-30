-- Extensao de "turmas como agenda" (30/10/2026): a aula tambem guarda a
-- propria modalidade, do mesmo jeito que professor_id e servico_id (Etapa 2).
--
-- Pedido do tio (30/10/2026): poder trocar a modalidade de uma aula isolada
-- (ex: aula presencial que essa semana vira online), sem mudar a turma toda.

alter table public.aulas
  add column modalidade public.modalidade;

update public.aulas a
   set modalidade = t.modalidade
  from public.turmas t
 where t.id = a.turma_id;

alter table public.aulas
  alter column modalidade set not null;

-- A aula nasce com a modalidade da turma, igual professor_id e servico_id.
create or replace function public.aula_herda_da_turma()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.professor_id is null or new.servico_id is null or new.modalidade is null then
    select coalesce(new.professor_id, t.professor_id),
           coalesce(new.servico_id, t.servico_id),
           coalesce(new.modalidade, t.modalidade)
      into new.professor_id, new.servico_id, new.modalidade
      from turmas t
     where t.id = new.turma_id;
  end if;
  return new;
end;
$$;

-- Trocar a modalidade da turma tambem propaga so para aulas Agendadas de
-- hoje em diante sem chamada, igual professor_id e servico_id. A funcao
-- continua respeitando vinclo.sem_propagar (ligado dentro da transacao de
-- dividir_turma, etapa 6d).
create or replace function public.turma_propaga_para_aulas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('vinclo.sem_propagar', true), '') = 'on' then
    return new;
  end if;
  update aulas a
     set professor_id = case when a.professor_id = old.professor_id then new.professor_id else a.professor_id end,
         servico_id = case when a.servico_id = old.servico_id then new.servico_id else a.servico_id end,
         modalidade = case when a.modalidade = old.modalidade then new.modalidade else a.modalidade end
   where a.turma_id = new.id
     and a.status = 'Agendada'
     and a.data_hora_inicio::date >= (now() at time zone 'America/Sao_Paulo')::date
     and not exists (select 1 from presencas p where p.aula_id = a.id);
  return new;
end;
$$;

drop trigger if exists turma_propaga_para_aulas on public.turmas;

create trigger turma_propaga_para_aulas
  after update of professor_id, servico_id, modalidade on public.turmas
  for each row
  when (
    old.professor_id is distinct from new.professor_id
    or old.servico_id is distinct from new.servico_id
    or old.modalidade is distinct from new.modalidade
  )
  execute function public.turma_propaga_para_aulas();
