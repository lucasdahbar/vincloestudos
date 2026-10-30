-- Etapa 6d de "turmas como agenda" (29/10/2026): a serie guarda em que agenda
-- do Google ela esta, como o evento avulso da aula ja guarda (etapa 6b).
--
-- Trocar o professor da turma criava a serie na agenda do professor novo e
-- deixava a antiga orfa na agenda do anterior: o id do evento so vale na
-- agenda onde ele nasceu. Com a agenda guardada, a sincronizacao tira a serie
-- de la antes de criar a nova.
--
-- As series que ja existem estao na agenda do professor atual: quando o
-- professor mudou, a sincronizacao recriou o evento na agenda nova e gravou
-- o id dele.
alter table public.turmas add column google_evento_agenda text;

update public.turmas t
   set google_evento_agenda = p.google_calendar_id
  from public.professores p
 where p.id = t.professor_id
   and t.google_calendar_event_id is not null;
