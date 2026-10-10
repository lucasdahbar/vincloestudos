-- Rodada 4 (spec 6.2): exclui uma aula e transfere os alunos para reposicao,
-- tudo numa transacao. O plano (quem vai para onde, quem precisa de matricula
-- de reposicao) e montado na aplicacao, pelas regras de `planejarReposicao`;
-- aqui so se aplica, conferindo de novo que a aula nao aconteceu.
--
-- p_novas: [{aluno_id, aula_destino_id|null, matricula_turma_id|null, matricula_data|null}]
-- p_devolvidas: [{pendencia_id, aula_destino_id|null, matricula_turma_id|null, matricula_data|null}]

create or replace function public.excluir_aula(
  p_aula_id bigint,
  p_novas jsonb,
  p_devolvidas jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status public.status_aula;
  v_item jsonb;
  v_pendencia bigint;
  v_antiga bigint;
  v_matricula bigint;
begin
  if not public.e_gestora() then
    raise exception 'Só a gestora pode excluir aulas.';
  end if;

  select status into v_status from aulas where id = p_aula_id for update;
  if not found then
    raise exception 'Esta aula não existe mais.';
  end if;
  if v_status in ('Realizada', 'Excluída')
     or exists (select 1 from presencas where aula_id = p_aula_id) then
    raise exception 'Esta aula já aconteceu ou já foi excluída.';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_novas, '[]'::jsonb)) loop
    v_matricula := null;
    if v_item->>'matricula_turma_id' is not null then
      insert into matriculas (aluno_id, turma_id, data_inicio, data_fim, flag_reposicao)
      values ((v_item->>'aluno_id')::bigint, (v_item->>'matricula_turma_id')::bigint,
              (v_item->>'matricula_data')::date, (v_item->>'matricula_data')::date, true)
      returning id into v_matricula;
    end if;

    insert into pendencias_reposicao
      (aluno_id, aula_origem_id, origem, status, aula_reposicao_id, matricula_reposicao_id)
    values (
      (v_item->>'aluno_id')::bigint,
      p_aula_id,
      'Exclusão',
      (case when v_item->>'aula_destino_id' is null then 'Pendente' else 'Agendada' end)::status_reposicao,
      (v_item->>'aula_destino_id')::bigint,
      v_matricula
    );
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_devolvidas, '[]'::jsonb)) loop
    v_pendencia := (v_item->>'pendencia_id')::bigint;

    select matricula_reposicao_id into v_antiga
      from pendencias_reposicao
     where id = v_pendencia and aula_reposicao_id = p_aula_id and status = 'Agendada'
       for update;
    if not found then
      raise exception 'Uma reposição desta aula mudou enquanto a exclusão era preparada. Abra a aula de novo.';
    end if;

    v_matricula := null;
    if v_item->>'matricula_turma_id' is not null then
      insert into matriculas (aluno_id, turma_id, data_inicio, data_fim, flag_reposicao)
      select aluno_id, (v_item->>'matricula_turma_id')::bigint,
             (v_item->>'matricula_data')::date, (v_item->>'matricula_data')::date, true
        from pendencias_reposicao where id = v_pendencia
      returning id into v_matricula;
    end if;

    update pendencias_reposicao
       set status = (case when v_item->>'aula_destino_id' is null then 'Pendente' else 'Agendada' end)::status_reposicao,
           aula_reposicao_id = (v_item->>'aula_destino_id')::bigint,
           matricula_reposicao_id = v_matricula
     where id = v_pendencia;

    -- A matricula de reposicao era so para a aula que saiu (mesmo tratamento
    -- de desistirReposicao).
    if v_antiga is not null then
      delete from matriculas where id = v_antiga;
    end if;
  end loop;

  update aulas set status = 'Excluída' where id = p_aula_id;
end;
$$;

grant execute on function public.excluir_aula(bigint, jsonb, jsonb) to authenticated;
