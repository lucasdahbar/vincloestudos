-- Etapa 7 de "turmas como agenda" (30/10/2026): a aula que muda de mes depois
-- de entrar numa cobranca (mudar a serie a partir de uma data, etapa 6d).

-- 1. Decisao 6: a aula ja cobrada continua cobrada no mes original e aparece a
--    R$ 0,00 no mes novo, com "era <dia> as <hora>". O item guarda quando a
--    aula era: na criacao, e de novo quando a cobranca deixa de ser rascunho
--    (enquanto rascunho, ela acompanha a aula).
alter table public.itens_cobranca add column data_aula timestamptz;

update public.itens_cobranca i
   set data_aula = a.data_hora_inicio
  from public.aulas a
 where a.id = i.aula_id;

create or replace function public.item_guarda_data_da_aula()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_aula is null then
    select data_hora_inicio into new.data_aula from aulas where id = new.aula_id;
  end if;
  return new;
end;
$$;

create trigger item_guarda_data_da_aula
  before insert on public.itens_cobranca
  for each row execute function public.item_guarda_data_da_aula();

create or replace function public.cobranca_congela_data_das_aulas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update itens_cobranca i
     set data_aula = a.data_hora_inicio
    from aulas a
   where a.id = i.aula_id and i.cobranca_id = new.id;
  return new;
end;
$$;

create trigger cobranca_congela_data_das_aulas
  after update of status on public.cobrancas
  for each row
  when (old.status = 'Rascunho' and new.status <> 'Rascunho')
  execute function public.cobranca_congela_data_das_aulas();

-- 2. Item de rascunho cuja aula foi para outro mes: a geracao do mes novo o
--    traz para o rascunho dele (`p_trazer`), com o desconto que a gestora deu.
--    Antes, o mes novo tentava criar outro item para a mesma aula e aluno, e o
--    unique recusava o rascunho inteiro do responsavel. So sai de rascunho sem
--    recebimento: o credito abatido nele continua batendo com os itens.
drop function public.aplicar_plano_rascunho(bigint, date, bigint[], jsonb, jsonb);

create or replace function public.aplicar_plano_rascunho(
  p_responsavel_id bigint,
  p_mes date,
  p_apagar bigint[],
  p_atualizar jsonb,
  p_inserir jsonb,
  p_trazer bigint[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rascunhos bigint[];
  v_origens bigint[];
  v_alvo bigint;
  v_criada boolean := false;
  v_item jsonb;
  v_apagados int := 0;
  v_atualizados int := 0;
  v_inseridos int := 0;
begin
  perform 1 from cobrancas
   where responsavel_id = p_responsavel_id and status = 'Rascunho'
     and (mes_referencia = p_mes
          or id in (select cobranca_id from itens_cobranca where id = any (coalesce(p_trazer, '{}'))))
   for update;

  select coalesce(array_agg(id order by id), '{}') into v_rascunhos
    from cobrancas
   where responsavel_id = p_responsavel_id and mes_referencia = p_mes and status = 'Rascunho';
  v_alvo := v_rascunhos[1];

  -- Os de outro mes, so de rascunho do mesmo responsavel e sem recebimento.
  select coalesce(array_agg(distinct c.id), '{}') into v_origens
    from itens_cobranca i
    join cobrancas c on c.id = i.cobranca_id
   where i.id = any (coalesce(p_trazer, '{}'))
     and c.responsavel_id = p_responsavel_id
     and c.status = 'Rascunho'
     and c.mes_referencia <> p_mes
     and not exists (select 1 from recebimentos r where r.cobranca_id = c.id);

  if cardinality(v_origens) > 0 or jsonb_array_length(coalesce(p_inserir, '[]'::jsonb)) > 0 then
    if v_alvo is null then
      insert into cobrancas (responsavel_id, mes_referencia, complementar)
      values (
        p_responsavel_id,
        p_mes,
        exists (select 1 from cobrancas where responsavel_id = p_responsavel_id and mes_referencia = p_mes)
      )
      returning id into v_alvo;
      v_rascunhos := array[v_alvo];
      v_criada := true;
    end if;
  end if;

  if cardinality(v_origens) > 0 then
    update itens_cobranca
       set cobranca_id = v_alvo
     where id = any (p_trazer) and cobranca_id = any (v_origens);
  end if;

  with apagados as (
    delete from itens_cobranca
     where id = any (coalesce(p_apagar, '{}')) and cobranca_id = any (v_rascunhos)
    returning 1
  )
  select count(*) into v_apagados from apagados;

  for v_item in select * from jsonb_array_elements(coalesce(p_atualizar, '[]'::jsonb)) loop
    -- O desconto vem do banco, nao do plano: limitado ao novo valor da aula.
    update itens_cobranca
       set descricao = v_item->>'descricao',
           valor_original = (v_item->>'valor_original')::numeric,
           desconto = least(desconto, (v_item->>'valor_original')::numeric),
           valor_final = (v_item->>'valor_original')::numeric
                         - least(desconto, (v_item->>'valor_original')::numeric)
     where id = (v_item->>'id')::bigint and cobranca_id = any (v_rascunhos);
    if found then v_atualizados := v_atualizados + 1; end if;
  end loop;

  if jsonb_array_length(coalesce(p_inserir, '[]'::jsonb)) > 0 then
    insert into itens_cobranca (cobranca_id, aluno_id, aula_id, descricao, valor_original, desconto, valor_final)
    select v_alvo,
           (x->>'aluno_id')::bigint,
           (x->>'aula_id')::bigint,
           x->>'descricao',
           (x->>'valor_original')::numeric,
           (x->>'desconto')::numeric,
           (x->>'valor_final')::numeric
      from jsonb_array_elements(p_inserir) x;
    get diagnostics v_inseridos = row_count;
  end if;

  update cobrancas c
     set valor_bruto = coalesce((select sum(i.valor_original) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_desconto = coalesce((select sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_total = coalesce((select sum(i.valor_original) - sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0)
   where c.id = any (v_rascunhos || v_origens);

  -- Rascunho que ficou sem item nao tem o que a gestora confirmar — salvo se
  -- ja recebeu algo (credito abatido): esse fica.
  delete from cobrancas c
   where c.id = any (v_rascunhos || v_origens)
     and not exists (select 1 from itens_cobranca i where i.cobranca_id = c.id)
     and not exists (select 1 from recebimentos r where r.cobranca_id = c.id);

  return jsonb_build_object(
    'criada', v_criada,
    'apagados', v_apagados,
    'atualizados', v_atualizados,
    'inseridos', v_inseridos
  );
end;
$$;

grant execute on function public.aplicar_plano_rascunho(bigint, date, bigint[], jsonb, jsonb, bigint[]) to authenticated;
