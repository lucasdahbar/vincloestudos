-- Etapa 6b de "turmas como agenda" (29/10/2026): trocar o professor de uma
-- aula so (substituicao, ou a correcao da decisao 7).
--
-- 1. A aula com outro professor ganha evento proprio na agenda dele, como a
--    remarcada. Guardar em que agenda o evento avulso esta: sem isso, trocar
--    o professor de novo (ou o da turma) deixaria o evento orfao na agenda
--    antiga, sem ter de onde apaga-lo. Os avulsos que ja existem estao todos
--    na agenda do professor da turma.
alter table public.aulas add column google_evento_avulso_agenda text;

update public.aulas a
   set google_evento_avulso_agenda = p.google_calendar_id
  from public.turmas t
  join public.professores p on p.id = t.professor_id
 where a.turma_id = t.id
   and a.google_evento_avulso_id is not null;

-- 2. Trocar o professor (ou o servico) da turma leva so as aulas que ainda
--    seguiam a turma. A aula com substituto fica com ele.
create or replace function public.turma_propaga_para_aulas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update aulas a
     set professor_id = case when a.professor_id = old.professor_id then new.professor_id else a.professor_id end,
         servico_id = case when a.servico_id = old.servico_id then new.servico_id else a.servico_id end
   where a.turma_id = new.id
     and a.status = 'Agendada'
     and a.data_hora_inicio::date >= (now() at time zone 'America/Sao_Paulo')::date
     and not exists (select 1 from presencas p where p.aula_id = a.id);
  return new;
end;
$$;
