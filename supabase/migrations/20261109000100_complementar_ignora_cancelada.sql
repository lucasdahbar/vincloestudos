-- Bug de 09/11/2026 (C1): cancelar uma cobranca para corrigir uma aula e gerar
-- de novo criava o rascunho novo como "complementar", porque a cancelada
-- contava como "cobranca anterior". So conta a que esta valendo. A
-- confirmacao recalcula a marca de qualquer jeito (dominio/cobrancas/complementar.ts);
-- isto deixa o rascunho certo desde a criacao.

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
        exists (select 1 from cobrancas
                 where responsavel_id = p_responsavel_id and mes_referencia = p_mes
                   and status not in ('Rascunho', 'Cancelada'))
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
