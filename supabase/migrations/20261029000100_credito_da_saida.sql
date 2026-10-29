-- Decisao 11 do Julio (28/10/2026): o aluno que sai da turma com aulas ja
-- cobradas depois da saida fica com credito delas, um por aula.
--
-- `item_cobranca_id` liga o credito ao item que o gerou. O unique e a
-- garantia de idempotencia: desmatricular, editar a data e desmatricular de
-- novo nao credita a mesma aula duas vezes.
alter table public.creditos
  add column item_cobranca_id bigint unique references public.itens_cobranca (id) on delete restrict;

-- Cancelar credito (pedido do Julio, 28/10/2026). O valor novo do enum so pode
-- ser usado na proxima transacao: a regra do check vem na migracao seguinte.
alter type public.uso_credito add value if not exists 'Cancelamento';
