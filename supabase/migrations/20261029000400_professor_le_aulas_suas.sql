-- Etapa 2 (29/10/2026): a aula e de quem a da. O professor logado le as
-- aulas em que ele e o professor da aula, e continua lendo as da turma que e
-- dele hoje. Sem isso, trocar o professor da turma esconderia do antigo as
-- aulas que ele deu.
drop policy "professor le aulas de suas turmas" on public.aulas;
create policy "professor le aulas de suas turmas" on public.aulas for select
  to authenticated using (
    aulas.professor_id = public.professor_do_usuario()
    or exists (
      select 1 from public.turmas t
       where t.id = aulas.turma_id
         and t.professor_id = public.professor_do_usuario()
    )
  );

drop policy "professor le presencas de suas turmas" on public.presencas;
create policy "professor le presencas de suas turmas" on public.presencas for select
  to authenticated using (
    exists (
      select 1 from public.aulas a
        join public.turmas t on t.id = a.turma_id
       where a.id = presencas.aula_id
         and (a.professor_id = public.professor_do_usuario()
              or t.professor_id = public.professor_do_usuario())
    )
  );
