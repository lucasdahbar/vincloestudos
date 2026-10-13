-- Refazer o rascunho a cada "Gerar cobrancas" (pedido do tio, 14/10/2026).
--
-- O plano (o que apagar, atualizar e inserir) e calculado na aplicacao, por
-- `dominio/cobrancas/rascunho.ts`; aqui ele e aplicado de uma vez para um
-- responsavel num mes. Ou o rascunho inteiro muda, ou nada muda: um erro no
-- meio deixaria meia cobranca para a gestora confirmar.
--
-- So mexe em RASCUNHO: cobranca confirmada nunca e alterada, nem por um id
-- errado no plano. A seguranca de quem pode chamar e a das policies ("gestora
-- total" em cobrancas e itens_cobranca): a funcao e security invoker.

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
  -- Trava os rascunhos do responsavel no mes: duas geracoes ao mesmo tempo
  -- esperam uma pela outra.
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
    update itens_cobranca
       set descricao = v_item->>'descricao',
           valor_original = (v_item->>'valor_original')::numeric,
           desconto = (v_item->>'desconto')::numeric,
           valor_final = (v_item->>'valor_final')::numeric
     where id = (v_item->>'id')::bigint and cobranca_id = any (v_rascunhos);
    if found then v_atualizados := v_atualizados + 1; end if;
  end loop;

  if jsonb_array_length(coalesce(p_inserir, '[]'::jsonb)) > 0 then
    if v_alvo is null then
      -- Nao ha rascunho: cria um. Se o mes ja tem outra cobranca (confirmada),
      -- ele e a complementar (C1).
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

  -- Rascunho que ficou sem item nao tem o que a gestora confirmar.
  delete from cobrancas c
   where c.id = any (v_rascunhos)
     and not exists (select 1 from itens_cobranca i where i.cobranca_id = c.id);

  return jsonb_build_object(
    'criada', v_criada,
    'apagados', v_apagados,
    'atualizados', v_atualizados,
    'inseridos', v_inseridos
  );
end;
$$;

grant execute on function public.aplicar_plano_rascunho(bigint, date, bigint[], jsonb, jsonb) to authenticated;
