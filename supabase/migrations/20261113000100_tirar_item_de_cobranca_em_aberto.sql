-- Opcao A do Julio (13/11/2026), depois do caso Isabela: a aula que a gestora
-- decidiu nao cobrar sai da cobranca enquanto nao entrou dinheiro nenhum,
-- tambem depois de confirmada ou enviada. Antes so saia do rascunho, e da
-- confirmada em diante virava credito sobre uma cobranca que ninguem tinha
-- pago. A regra fica em dominio/reposicoes/desfecho.ts (destinoDaAulaNaoCobrada);
-- aqui so o que precisa ser atomico, com as travas conferidas de novo sob o lock.
--
-- Devolve o que aconteceu com a cobranca:
--   null        nao saiu (status mudou, entrou recebimento, item com credito):
--               a aplicacao segue pelo caminho do credito com o estado novo
--   'Apagada'   era rascunho e ficou vazio (como em remover_item_de_rascunho)
--   'Cancelada' confirmada/enviada que ficou sem aula nenhuma
--   'Rascunho' | 'Confirmada'  o status com que ela ficou. A enviada volta a
--               confirmada: o valor mudou e a Kelly precisa mandar de novo.
--               O texto do WhatsApp e refeito pela aplicacao.

create or replace function public.tirar_item_de_cobranca_em_aberto(p_item_id bigint)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cobranca bigint;
  v_status public.status_cobranca;
begin
  select cobranca_id into v_cobranca from itens_cobranca where id = p_item_id;
  if not found then
    return null;
  end if;

  select status into v_status from cobrancas where id = v_cobranca for update;
  if v_status not in ('Rascunho', 'Confirmada', 'Enviada') then
    return null;
  end if;
  if exists (select 1 from recebimentos where cobranca_id = v_cobranca) then
    return null;
  end if;
  if exists (select 1 from creditos where item_cobranca_id = p_item_id) then
    return null;
  end if;

  delete from itens_cobranca where id = p_item_id;

  if not exists (select 1 from itens_cobranca where cobranca_id = v_cobranca) then
    if v_status = 'Rascunho' then
      delete from cobrancas where id = v_cobranca;
      return 'Apagada';
    end if;
    update cobrancas
       set status = 'Cancelada', valor_bruto = 0, valor_desconto = 0, valor_total = 0
     where id = v_cobranca;
    return 'Cancelada';
  end if;

  update cobrancas c
     set valor_bruto = coalesce((select sum(i.valor_original) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_desconto = coalesce((select sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_total = coalesce((select sum(i.valor_original) - sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         status = case when v_status = 'Enviada' then 'Confirmada'::public.status_cobranca else v_status end
   where c.id = v_cobranca;

  return case when v_status = 'Enviada' then 'Confirmada' else v_status::text end;
end;
$$;

grant execute on function public.tirar_item_de_cobranca_em_aberto(bigint) to authenticated;
