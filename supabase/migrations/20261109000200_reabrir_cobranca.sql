-- Reabrir rascunho (pedido do Julio, 09/11/2026): a cobranca confirmada e
-- ainda nao enviada volta para rascunho, com as mesmas aulas e descontos.
-- As regras ficam em dominio/cobrancas/reabertura.ts; aqui so o que precisa
-- ser atomico, com as travas de dinheiro conferidas de novo sob o lock.
--
-- Se, enquanto ela estava confirmada, uma geracao criou outro rascunho do
-- mesmo responsavel e mes (aulas novas, complementar), ele e juntado a este:
-- dois rascunhos da mesma familia no mesmo mes virariam duas mensagens.
-- O rascunho com recebimento (credito abatido) fica separado, porque o valor
-- dele bate com o que foi abatido.
create or replace function public.reabrir_cobranca(p_cobranca_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resp bigint;
  v_mes date;
  v_juntados bigint[];
begin
  select responsavel_id, mes_referencia into v_resp, v_mes
    from cobrancas
   where id = p_cobranca_id and status = 'Confirmada'
   for update;
  if not found then
    raise exception 'Só uma cobrança confirmada e ainda não enviada volta para rascunho.';
  end if;

  if exists (select 1 from recebimentos where cobranca_id = p_cobranca_id) then
    raise exception 'Esta cobrança já tem pagamento registrado e não volta para rascunho.';
  end if;
  if exists (
    select 1 from creditos c join itens_cobranca i on i.id = c.item_cobranca_id
     where i.cobranca_id = p_cobranca_id
  ) then
    raise exception 'Uma aula desta cobrança gerou crédito. Cancele a cobrança e gere de novo.';
  end if;

  perform 1 from cobrancas
   where responsavel_id = v_resp and mes_referencia = v_mes and status = 'Rascunho'
   for update;

  select coalesce(array_agg(c.id), '{}') into v_juntados
    from cobrancas c
   where c.responsavel_id = v_resp and c.mes_referencia = v_mes and c.status = 'Rascunho'
     and not exists (select 1 from recebimentos r where r.cobranca_id = c.id);

  update itens_cobranca set cobranca_id = p_cobranca_id where cobranca_id = any (v_juntados);
  delete from cobrancas where id = any (v_juntados);

  update cobrancas c
     set status = 'Rascunho',
         texto_whatsapp = null,
         complementar = exists (
           select 1 from cobrancas o
            where o.responsavel_id = v_resp and o.mes_referencia = v_mes and o.id <> c.id
              and o.status not in ('Rascunho', 'Cancelada')),
         valor_bruto = coalesce((select sum(i.valor_original) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_desconto = coalesce((select sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_total = coalesce((select sum(i.valor_original) - sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0)
   where c.id = p_cobranca_id;

  return jsonb_build_object('juntados', cardinality(v_juntados));
end;
$$;

grant execute on function public.reabrir_cobranca(bigint) to authenticated;
