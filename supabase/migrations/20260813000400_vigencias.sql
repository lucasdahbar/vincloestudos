-- Mantem o historico de vigencia sincronizado com o valor corrente.
-- A aplicacao nunca escreve nas tabelas de historico: elas sao derivadas.

create or replace function public.registrar_vigencia_servico()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.valor_padrao = old.valor_padrao then
    return new;
  end if;

  update public.servico_valor_historico
     set vigencia_fim = current_date - 1
   where servico_id = new.id
     and vigencia_fim is null
     and vigencia_inicio < current_date;

  delete from public.servico_valor_historico
   where servico_id = new.id
     and vigencia_inicio = current_date;

  insert into public.servico_valor_historico (servico_id, valor, vigencia_inicio)
  values (new.id, new.valor_padrao, current_date);

  return new;
end;
$$;

create trigger registrar_vigencia
  after insert or update of valor_padrao on public.servicos
  for each row execute function public.registrar_vigencia_servico();

create or replace function public.registrar_vigencia_professor()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.percentual_repasse = old.percentual_repasse then
    return new;
  end if;

  update public.professor_percentual_historico
     set vigencia_fim = current_date - 1
   where professor_id = new.id
     and vigencia_fim is null
     and vigencia_inicio < current_date;

  delete from public.professor_percentual_historico
   where professor_id = new.id
     and vigencia_inicio = current_date;

  insert into public.professor_percentual_historico (professor_id, percentual, vigencia_inicio)
  values (new.id, new.percentual_repasse, current_date);

  return new;
end;
$$;

create trigger registrar_vigencia
  after insert or update of percentual_repasse on public.professores
  for each row execute function public.registrar_vigencia_professor();

-- Consultas usadas pelos modulos de cobranca e pagamento (Planos 2 e 3).
create or replace function public.valor_servico_em(p_servico_id bigint, p_data date)
returns numeric
language sql
stable
as $$
  select h.valor
    from public.servico_valor_historico h
   where h.servico_id = p_servico_id
     and h.vigencia_inicio <= p_data
     and (h.vigencia_fim is null or h.vigencia_fim >= p_data)
   order by h.vigencia_inicio desc
   limit 1;
$$;

create or replace function public.percentual_professor_em(p_professor_id bigint, p_data date)
returns numeric
language sql
stable
as $$
  select h.percentual
    from public.professor_percentual_historico h
   where h.professor_id = p_professor_id
     and h.vigencia_inicio <= p_data
     and (h.vigencia_fim is null or h.vigencia_fim >= p_data)
   order by h.vigencia_inicio desc
   limit 1;
$$;
