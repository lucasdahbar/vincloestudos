-- Travas do rascunho refeito (revisao de 14/10/2026).
--
--  * Rascunho com recebimento (um credito pode abater um rascunho) NUNCA e
--    apagado, mesmo vazio: `recebimentos` e o uso do credito caem em cascata.
--  * O desconto digitado a mao e relido no banco na hora de gravar: se a
--    gestora o mudou entre o calculo do plano e a gravacao, vale o dela.
--  * Nova `remover_item_de_rascunho`: "nao cobrar" uma aula so em rascunho tira
--    o item com a mesma trava, e devolve false se a cobranca foi confirmada no
--    meio (a aplicacao segue pelo caminho do credito).

create or replace function public.aplicar_plano_rascunho(
  p_responsavel_id bigint,
  p_mes date,
  p_apagar bigint[],
  p_atualizar jsonb,
  p_inserir jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rascunhos bigint[];
  v_alvo bigint;
  v_criada boolean := false;
  v_item jsonb;
  v_apagados int := 0;
  v_atualizados int := 0;
  v_inseridos int := 0;
begin
  perform 1 from cobrancas
   where responsavel_id = p_responsavel_id and mes_referencia = p_mes and status = 'Rascunho'
   for update;

  select coalesce(array_agg(id order by id), '{}') into v_rascunhos
    from cobrancas
   where responsavel_id = p_responsavel_id and mes_referencia = p_mes and status = 'Rascunho';
  v_alvo := v_rascunhos[1];

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
   where c.id = any (v_rascunhos);

  -- Rascunho que ficou sem item nao tem o que a gestora confirmar — salvo se
  -- ja recebeu algo (credito abatido): esse fica.
  delete from cobrancas c
   where c.id = any (v_rascunhos)
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

create or replace function public.remover_item_de_rascunho(p_item_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cobranca bigint;
begin
  select cobranca_id into v_cobranca from itens_cobranca where id = p_item_id;
  if not found then
    return false;
  end if;

  perform 1 from cobrancas where id = v_cobranca and status = 'Rascunho' for update;
  if not found then
    return false;
  end if;

  delete from itens_cobranca where id = p_item_id;

  update cobrancas c
     set valor_bruto = coalesce((select sum(i.valor_original) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_desconto = coalesce((select sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_total = coalesce((select sum(i.valor_original) - sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0)
   where c.id = v_cobranca;

  delete from cobrancas c
   where c.id = v_cobranca
     and not exists (select 1 from itens_cobranca i where i.cobranca_id = c.id)
     and not exists (select 1 from recebimentos r where r.cobranca_id = c.id);

  return true;
end;
$$;

grant execute on function public.remover_item_de_rascunho(bigint) to authenticated;
