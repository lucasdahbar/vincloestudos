-- Etapa 6d de "turmas como agenda" (29/10/2026): mudar a serie a partir de
-- uma data. Como o Google faz: a turma termina na vespera do corte e nasce uma
-- continuacao com a regra nova (decidido pelo Lucas em 29/10/2026). O plano
-- vem de `dominio/turmas/divisao.ts`; aqui ele e gravado de uma vez.

-- 1. A continuacao aponta para a turma de onde veio.
alter table public.turmas
  add column continua_de bigint references public.turmas (id) on delete set null;

create index on public.turmas (continua_de);

-- 2. Trocar professor ou servico da turma leva as aulas de hoje em diante
--    (etapa 2). Na divisao, cada aula ja chega com os valores certos (a que
--    ficou cobrada mantem o servico, decisao 8), entao a propagacao e
--    desligada so dentro da transacao dela.
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
         servico_id = case when a.servico_id = old.servico_id then new.servico_id else a.servico_id end
   where a.turma_id = new.id
     and a.status = 'Agendada'
     and a.data_hora_inicio::date >= (now() at time zone 'America/Sao_Paulo')::date
     and not exists (select 1 from presencas p where p.aula_id = a.id);
  return new;
end;
$$;

-- 3. A divisao. `p_regra`: nome, dias_semana, horario_inicio, horario_fim,
--    professor_id e servico_id da regra nova. `p_aulas`: TODA aula do corte em
--    diante, com inicio, fim, original, professor_id e servico_id finais
--    (AAAA-MM-DDTHH:MM, no relogio da escola, como o resto do sistema grava).
--    Devolve a turma que fica com a regra nova.
create or replace function public.dividir_turma(
  p_turma_id bigint,
  p_corte date,
  p_nova boolean,
  p_regra jsonb,
  p_aulas jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turma turmas%rowtype;
  v_destino bigint;
  v_esperadas bigint[];
  v_recebidas bigint[];
begin
  if not public.e_gestora() then
    raise exception 'Só a gestora pode mudar turmas.';
  end if;

  select * into v_turma from turmas where id = p_turma_id for update;
  if not found then
    raise exception 'Esta turma não existe mais.';
  end if;
  if v_turma.status <> 'Ativa' or v_turma.tipo_recorrencia <> 'Recorrente' then
    raise exception 'Só uma turma recorrente e ativa muda a partir de uma data.';
  end if;
  if p_corte < v_turma.data_inicio or p_corte > v_turma.data_fim then
    raise exception 'A data está fora do período da turma.';
  end if;

  -- A previa foi feita sobre as aulas de entao. Se alguma entrou ou saiu
  -- desde la, o plano nao vale mais.
  if p_nova <> exists (
    select 1 from aulas
     where turma_id = p_turma_id
       and (data_hora_referencia at time zone 'UTC')::date < p_corte
  ) then
    raise exception 'As aulas da turma mudaram desde a prévia. Abra a prévia de novo.';
  end if;
  select coalesce(array_agg(id order by id), '{}') into v_esperadas
    from aulas_da_turma_desde(p_turma_id, p_corte) as id;
  select coalesce(array_agg((x ->> 'id')::bigint order by (x ->> 'id')::bigint), '{}') into v_recebidas
    from jsonb_array_elements(p_aulas) as x;
  if v_esperadas <> v_recebidas then
    raise exception 'As aulas da turma mudaram desde a prévia. Abra a prévia de novo.';
  end if;

  -- Aula com chamada nao muda de dia nem de professor por aqui (decisoes 5 e 7).
  if exists (
    select 1
      from jsonb_to_recordset(p_aulas) as x (id bigint, inicio text, professor_id bigint)
      join aulas a on a.id = x.id
     where exists (select 1 from presencas p where p.aula_id = a.id)
       and (a.data_hora_inicio <> (x.inicio::timestamp at time zone 'UTC') or a.professor_id <> x.professor_id)
  ) then
    raise exception 'Uma aula com chamada feita mudaria. Abra a prévia de novo.';
  end if;

  perform set_config('vinclo.sem_propagar', 'on', true);

  if p_nova then
    insert into turmas (
      nome, servico_id, materia_id, escola_id, ano_escolar_id, professor_id, modalidade,
      dias_semana, horario_inicio, horario_fim, status, tipo_recorrencia, frequencia, intervalo,
      data_inicio, data_fim, fim_automatico, link_videochamada, google_meet_sala, continua_de
    )
    values (
      p_regra ->> 'nome', (p_regra ->> 'servico_id')::bigint, v_turma.materia_id, v_turma.escola_id,
      v_turma.ano_escolar_id, (p_regra ->> 'professor_id')::bigint, v_turma.modalidade,
      array(select jsonb_array_elements_text(p_regra -> 'dias_semana')::smallint),
      (p_regra ->> 'horario_inicio')::time, (p_regra ->> 'horario_fim')::time,
      'Ativa', 'Recorrente', v_turma.frequencia, v_turma.intervalo,
      -- O mesmo link do Meet: alunos e professor continuam na mesma sala.
      p_corte, v_turma.data_fim, v_turma.fim_automatico, v_turma.link_videochamada,
      v_turma.google_meet_sala, p_turma_id
    )
    returning id into v_destino;

    -- A turma de hoje termina na vespera e sai da renovacao de fim de ano. Ela
    -- fecha sozinha quando a data passa (fechar_turma_vencida, etapa 4).
    update turmas set data_fim = p_corte - 1, fim_automatico = false where id = p_turma_id;

    -- Matriculas: a que comeca no corte ou depois muda de turma; a que o
    -- atravessa termina na vespera e continua na turma nova. Nao gera
    -- credito: as aulas cobradas vao junto para a continuacao.
    update matriculas set turma_id = v_destino
     where turma_id = p_turma_id and status = 'Ativa' and data_inicio >= p_corte;

    insert into matriculas (aluno_id, turma_id, data_inicio, data_fim, flag_reposicao, status)
    select aluno_id, v_destino, p_corte, data_fim, flag_reposicao, 'Ativa'
      from matriculas
     where turma_id = p_turma_id and status = 'Ativa'
       and data_inicio < p_corte and (data_fim is null or data_fim >= p_corte);

    update matriculas set data_fim = p_corte - 1
     where turma_id = p_turma_id and status = 'Ativa'
       and data_inicio < p_corte and (data_fim is null or data_fim >= p_corte);
  else
    v_destino := p_turma_id;
    update turmas
       set nome = p_regra ->> 'nome',
           servico_id = (p_regra ->> 'servico_id')::bigint,
           professor_id = (p_regra ->> 'professor_id')::bigint,
           dias_semana = array(select jsonb_array_elements_text(p_regra -> 'dias_semana')::smallint),
           horario_inicio = (p_regra ->> 'horario_inicio')::time,
           horario_fim = (p_regra ->> 'horario_fim')::time
     where id = p_turma_id;
  end if;

  -- As aulas mudam no mesmo registro: aluno, aviso, reposicao e cobranca vao
  -- junto. A chave da sincronizacao segue a regra nova (local:t<turma>:<dia
  -- da regra>T<hora>), para a materializacao nao criar outra no mesmo dia.
  -- Em dois passos: no primeiro, duas aulas podiam trocar de chave.
  update aulas a
     set google_calendar_event_id = 'divisao:' || a.id
   where a.id = any (v_recebidas);

  update aulas a
     set turma_id = v_destino,
         data_hora_inicio = x.inicio::timestamp at time zone 'UTC',
         data_hora_fim = x.fim::timestamp at time zone 'UTC',
         data_hora_original = case when x.original is null then null else x.original::timestamp at time zone 'UTC' end,
         professor_id = x.professor_id,
         servico_id = x.servico_id,
         google_calendar_event_id = 'local:t' || v_destino || ':' || coalesce(x.original, x.inicio)
    from jsonb_to_recordset(p_aulas)
      as x (id bigint, inicio text, fim text, original text, professor_id bigint, servico_id bigint)
   where a.id = x.id;

  return v_destino;
end;
$$;
