-- Decisao 3 do Julio (28/10/2026): a conta a pagar do professor ganha
-- rascunho. O rascunho nao reserva as presencas (presencas.conta_pagar_id
-- fica nulo), entao nao trava a aula; so a conta confirmada trava.
--
-- Os itens seguram presenca e pendencia com `on delete restrict`, o que vale
-- para a conta confirmada. No rascunho, apagar a presenca (chamada corrigida)
-- ou a pendencia (aviso cancelado) solta o item, e o total do rascunho e
-- refeito. Confirmar calcula tudo de novo de qualquer jeito.
create or replace function public.solta_do_rascunho_de_pagamento()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_contas bigint[];
begin
  with soltos as (
    delete from itens_conta_pagar_professor i
     using contas_pagar_professor c
     where c.id = i.conta_pagar_id
       and c.status = 'Rascunho'
       and (
         (tg_table_name = 'presencas' and i.presenca_id = old.id)
         or (tg_table_name = 'pendencias_reposicao' and i.pendencia_id = old.id)
       )
    returning i.conta_pagar_id
  )
  select coalesce(array_agg(distinct conta_pagar_id), '{}') into v_contas from soltos;

  if cardinality(v_contas) > 0 then
    update contas_pagar_professor c
       set valor_total = coalesce((select sum(i.valor_professor) from itens_conta_pagar_professor i where i.conta_pagar_id = c.id), 0)
     where c.id = any (v_contas);
  end if;
  return old;
end;
$$;

create trigger solta_do_rascunho_de_pagamento
  before delete on public.presencas
  for each row execute function public.solta_do_rascunho_de_pagamento();

create trigger solta_do_rascunho_de_pagamento
  before delete on public.pendencias_reposicao
  for each row execute function public.solta_do_rascunho_de_pagamento();

-- Rascunho novo nasce como rascunho.
alter table public.contas_pagar_professor alter column status set default 'Rascunho';
