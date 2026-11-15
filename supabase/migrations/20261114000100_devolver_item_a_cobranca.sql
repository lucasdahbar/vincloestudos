-- Pedido do Julio (13/11/2026): cancelar o aviso devolve a aula para a mesma
-- cobranca de onde ela saiu, se ela continua sem pagamento. Antes a aula
-- voltava numa cobranca complementar nova, so com ela. Regra em
-- dominio/reposicoes/desfecho.ts (voltaParaAMesmaCobranca).
--
-- `item_retirado`: copia do item que saiu de uma cobranca ja pronta ou
-- enviada por causa deste aviso ({cobranca_id, descricao, valor_original,
-- desconto, data_aula}). Sem ela nao ha como saber de onde a aula saiu.
alter table public.pendencias_reposicao add column item_retirado jsonb;

-- Devolve o item sob lock, conferindo de novo as travas. Devolve o status com
-- que a cobranca ficou ('Confirmada': a enviada volta, porque o valor mudou e
-- a Kelly precisa mandar de novo) ou null quando nao da (paga, cancelada, ou
-- a aula ja voltou a ser cobrada em outro lugar). O texto do WhatsApp e
-- refeito pela aplicacao.
create or replace function public.devolver_item_a_cobranca(
  p_aluno_id bigint,
  p_aula_id bigint,
  p_item jsonb
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cobranca bigint := (p_item->>'cobranca_id')::bigint;
  v_status public.status_cobranca;
begin
  select status into v_status from cobrancas where id = v_cobranca for update;
  if not found or v_status not in ('Confirmada', 'Enviada') then
    return null;
  end if;
  if exists (select 1 from recebimentos where cobranca_id = v_cobranca) then
    return null;
  end if;
  if exists (select 1 from itens_cobranca where aula_id = p_aula_id and aluno_id = p_aluno_id) then
    return null;
  end if;

  insert into itens_cobranca (cobranca_id, aluno_id, aula_id, descricao, valor_original, desconto, valor_final, data_aula)
  values (
    v_cobranca,
    p_aluno_id,
    p_aula_id,
    p_item->>'descricao',
    (p_item->>'valor_original')::numeric,
    (p_item->>'desconto')::numeric,
    (p_item->>'valor_original')::numeric - (p_item->>'desconto')::numeric,
    (p_item->>'data_aula')::timestamptz
  );

  update cobrancas c
     set valor_bruto = coalesce((select sum(i.valor_original) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_desconto = coalesce((select sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_total = coalesce((select sum(i.valor_original) - sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         status = 'Confirmada'
   where c.id = v_cobranca;

  return 'Confirmada';
end;
$$;

grant execute on function public.devolver_item_a_cobranca(bigint, bigint, jsonb) to authenticated;
