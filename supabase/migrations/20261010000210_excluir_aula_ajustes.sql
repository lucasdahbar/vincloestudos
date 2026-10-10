-- Ajustes de excluir_aula: a matricula de reposicao antiga sai ANTES de criar
-- a nova (senao o gatilho de sobreposicao barra quando a data se repete),
-- erros amigaveis, conferencia da aula de destino e da aula no final.

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
  v_destino bigint;
  v_msg_destino constant text := 'Uma das aulas escolhidas para reposição não está mais disponível.';
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
    v_destino := (v_item->>'aula_destino_id')::bigint;
    if v_destino is not null
       and not exists (select 1 from aulas where id = v_destino and status = 'Agendada' and id <> p_aula_id) then
      raise exception '%', v_msg_destino;
    end if;

    v_matricula := null;
    if v_item->>'matricula_turma_id' is not null then
      insert into matriculas (aluno_id, turma_id, data_inicio, data_fim, flag_reposicao)
      values ((v_item->>'aluno_id')::bigint, (v_item->>'matricula_turma_id')::bigint,
              (v_item->>'matricula_data')::date, (v_item->>'matricula_data')::date, true)
      returning id into v_matricula;
    end if;

    begin
      insert into pendencias_reposicao
        (aluno_id, aula_origem_id, origem, status, aula_reposicao_id, matricula_reposicao_id)
      values (
        (v_item->>'aluno_id')::bigint,
        p_aula_id,
        'Exclusão',
        (case when v_destino is null then 'Pendente' else 'Agendada' end)::status_reposicao,
        v_destino,
        v_matricula
      );
    exception when unique_violation then
      raise exception 'Um aluno desta aula acabou de ter uma ausência registrada. Abra a aula de novo.';
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_devolvidas, '[]'::jsonb)) loop
    v_pendencia := (v_item->>'pendencia_id')::bigint;
    v_destino := (v_item->>'aula_destino_id')::bigint;

    if v_destino is not null
       and not exists (select 1 from aulas where id = v_destino and status = 'Agendada' and id <> p_aula_id) then
      raise exception '%', v_msg_destino;
    end if;

    select matricula_reposicao_id into v_antiga
      from pendencias_reposicao
     where id = v_pendencia and aula_reposicao_id = p_aula_id and status = 'Agendada'
       for update;
    if not found then
      raise exception 'Uma reposição desta aula mudou enquanto a exclusão era preparada. Abra a aula de novo.';
    end if;

    -- A matricula de reposicao era so para a aula que saiu (mesmo tratamento
    -- de desistirReposicao). Sai antes da nova, para o gatilho de sobreposicao
    -- nao barrar quando a data se repete.
    update pendencias_reposicao set matricula_reposicao_id = null where id = v_pendencia;
    if v_antiga is not null then
      delete from matriculas where id = v_antiga;
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
       set status = (case when v_destino is null then 'Pendente' else 'Agendada' end)::status_reposicao,
           aula_reposicao_id = v_destino,
           matricula_reposicao_id = v_matricula
     where id = v_pendencia;
  end loop;

  if exists (select 1 from pendencias_reposicao where aula_reposicao_id = p_aula_id and status = 'Agendada')
     or exists (select 1 from presencas where aula_id = p_aula_id) then
    raise exception 'Esta aula mudou enquanto a exclusão era preparada. Abra a aula de novo.';
  end if;

  update aulas set status = 'Excluída' where id = p_aula_id;
end;
$$;

grant execute on function public.excluir_aula(bigint, jsonb, jsonb) to authenticated;
