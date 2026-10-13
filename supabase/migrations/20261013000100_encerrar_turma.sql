-- Encerrar turma (pedido do tio, 13/10/2026; spec 2026-10-13-encerrar-turma).
--
-- p_data e o primeiro dia SEM aula: a turma termina na vespera. A regra e as
-- mensagens moram em `dominio/turmas/encerramento.ts`; aqui os bloqueios sao
-- conferidos de novo, dentro da transacao, e tudo e aplicado de uma vez.
--
-- Devolve os ids das cobrancas em rascunho que perderam itens, para a
-- aplicacao recalcular os totais.

-- As aulas da turma a partir de uma data. As horas sao gravadas como relogio
-- de parede em UTC (ver dominio/agenda/relogio.ts), entao o dia e o do UTC.
create or replace function public.aulas_da_turma_desde(p_turma_id bigint, p_data date)
returns setof bigint
language sql
stable
security invoker
set search_path = public
as $$
  select id from aulas
   where turma_id = p_turma_id
     and (data_hora_inicio at time zone 'UTC')::date >= p_data
$$;

create or replace function public.encerrar_turma(p_turma_id bigint, p_data date)
returns bigint[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turma record;
  v_ja_chegou boolean := p_data <= (now() at time zone 'America/Sao_Paulo')::date;
  v_cobrancas bigint[];
begin
  if not public.e_gestora() then
    raise exception 'Só a gestora pode encerrar turmas.';
  end if;

  select id, tipo_recorrencia, data_inicio, status into v_turma
    from turmas where id = p_turma_id for update;
  if not found then
    raise exception 'Esta turma não existe mais.';
  end if;
  if v_turma.status <> 'Ativa' then
    raise exception 'Esta turma já está encerrada.';
  end if;

  -- Bloqueios (os mesmos de avaliarEncerramento).
  if exists (
    select 1 from aulas a
     where a.id in (select aulas_da_turma_desde(p_turma_id, p_data))
       and (a.status = 'Realizada' or exists (select 1 from presencas p where p.aula_id = a.id))
  ) then
    raise exception 'Há aula já dada a partir dessa data. Abra o encerramento de novo para ver a primeira data possível.';
  end if;

  if v_turma.tipo_recorrencia = 'Recorrente' and p_data <= v_turma.data_inicio then
    raise exception 'Encerrar nessa data deixaria a turma sem aula nenhuma. Use Excluir turma.';
  end if;

  if exists (
    select 1 from pendencias_reposicao p
     where p.status = 'Agendada'
       and p.aula_reposicao_id in (select aulas_da_turma_desde(p_turma_id, p_data))
  ) then
    raise exception 'Há reposição marcada nesta turma a partir dessa data: remarque antes.';
  end if;

  if exists (
    select 1
      from itens_cobranca i
      join aulas a on a.id = i.aula_id
      join cobrancas c on c.id = i.cobranca_id
     where i.aula_id in (select aulas_da_turma_desde(p_turma_id, p_data))
       and c.status not in ('Rascunho', 'Cancelada')
       and a.status <> 'Excluída'
       and not exists (
         select 1 from pendencias_reposicao p
          where p.aluno_id = i.aluno_id and p.aula_origem_id = i.aula_id
       )
  ) then
    raise exception 'Há cobrança confirmada de aula a partir dessa data sem reposição. Abra o encerramento de novo para ver quais.';
  end if;

  -- Rascunho: as aulas que nao vao acontecer saem. Gerar a cobranca de novo
  -- so acrescenta aula, nunca tira, entao isto nao pode ficar para depois.
  with apagados as (
    delete from itens_cobranca i
     using cobrancas c
     where c.id = i.cobranca_id
       and c.status = 'Rascunho'
       and i.aula_id in (select aulas_da_turma_desde(p_turma_id, p_data))
    returning i.cobranca_id
  )
  select coalesce(array_agg(distinct cobranca_id), '{}') into v_cobrancas from apagados;

  -- Matriculas: a que comeca na data ou depois sai; as demais terminam na
  -- vespera e, se a data ja chegou, ficam Encerradas (como no "desmatricular").
  delete from matriculas
   where turma_id = p_turma_id and status = 'Ativa' and data_inicio >= p_data;

  update matriculas
     set data_fim = p_data - 1,
         status = case when v_ja_chegou then 'Encerrada'::status_matricula else status end
   where turma_id = p_turma_id
     and status = 'Ativa'
     and (data_fim is null or data_fim >= p_data);

  -- Aulas a partir da data: com vinculo (pendencia ou cobranca), a linha fica
  -- como Excluida para segurar o historico; sem vinculo, sai.
  update aulas a
     set status = 'Excluída'
   where a.id in (select aulas_da_turma_desde(p_turma_id, p_data))
     and a.status <> 'Excluída'
     and (
       exists (select 1 from pendencias_reposicao p where p.aula_origem_id = a.id or p.aula_reposicao_id = a.id)
       or exists (select 1 from itens_cobranca i where i.aula_id = a.id)
     );

  delete from aulas a
   where a.id in (select aulas_da_turma_desde(p_turma_id, p_data))
     and a.status <> 'Excluída';

  -- A turma: a recorrente termina na vespera e sai da renovacao de fim de ano.
  -- Com a data no futuro ela segue Ativa ate la.
  if v_turma.tipo_recorrencia = 'Recorrente' then
    update turmas
       set data_fim = p_data - 1,
           fim_automatico = false,
           status = case when v_ja_chegou then 'Encerrada'::status_turma else status end
     where id = p_turma_id;
  else
    update turmas set status = 'Encerrada' where id = p_turma_id;
  end if;

  return v_cobrancas;
end;
$$;

grant execute on function public.encerrar_turma(bigint, date) to authenticated;
