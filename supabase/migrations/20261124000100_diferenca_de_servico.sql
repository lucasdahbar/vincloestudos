-- Troca de servico em aula ja cobrada (Julio, 24/11/2026, caso Maira/Ana Clara):
-- a aula de 24/11 virou individual (R$ 150) depois de cobrada como grupo
-- (R$ 105), e a decisao 8 da varredura deixava o servico preso ao cobrado.
-- Agora a aula muda e a diferenca vai para o dinheiro:
--   cobranca sem recebimento   o item e corrigido nela mesma (ajustar_item_pela_troca_de_servico)
--   com recebimento, mais cara  a diferenca entra numa complementar (item com diferenca_id)
--   com recebimento, mais barata a diferenca vira credito
-- e a Kelly pode dispensar a diferenca na hora da troca (fica registrado).
-- Regra em dominio/cobrancas/troca-de-servico.ts.

create table public.diferencas_servico (
  id bigint generated always as identity primary key,
  aula_id bigint not null references public.aulas (id) on delete restrict,
  aluno_id bigint not null references public.alunos (id) on delete restrict,
  responsavel_id bigint not null references public.responsaveis (id) on delete restrict,
  servico_antes bigint not null references public.servicos (id) on delete restrict,
  servico_depois bigint not null references public.servicos (id) on delete restrict,
  -- Positivo: a familia deve mais. Negativo: a escola deve.
  valor numeric(12, 2) not null check (valor <> 0),
  destino text not null check (destino in ('Complementar', 'Crédito', 'Dispensada')),
  credito_id bigint unique references public.creditos (id) on delete set null,
  registrado_por text,
  created_at timestamptz not null default now(),
  constraint complementar_e_positiva check (destino <> 'Complementar' or valor > 0),
  constraint credito_e_negativo check (destino <> 'Crédito' or valor < 0)
);

create index on public.diferencas_servico (aula_id);
create index on public.diferencas_servico (aluno_id);

alter table public.diferencas_servico enable row level security;

create policy "gestora total" on public.diferencas_servico for all
  using (public.e_gestora()) with check (public.e_gestora());

-- O item da complementar aponta para a diferenca. A garantia de "nao cobrar a
-- mesma aula duas vezes" continua no banco: um item comum por aula e aluno, e
-- um item por diferenca.
alter table public.itens_cobranca
  add column diferenca_id bigint references public.diferencas_servico (id) on delete restrict;

alter table public.itens_cobranca drop constraint itens_cobranca_aula_aluno_key;
create unique index itens_cobranca_aula_aluno_key
  on public.itens_cobranca (aula_id, aluno_id) where diferenca_id is null;
create unique index itens_cobranca_diferenca_key
  on public.itens_cobranca (diferenca_id) where diferenca_id is not null;

-- O rascunho grava o diferenca_id do item montado. Igual a versao de
-- 09/11/2026 (complementar_ignora_cancelada), mais a coluna no insert.
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
    insert into itens_cobranca (cobranca_id, aluno_id, aula_id, descricao, valor_original, desconto, valor_final, diferenca_id)
    select v_alvo,
           (x->>'aluno_id')::bigint,
           (x->>'aula_id')::bigint,
           x->>'descricao',
           (x->>'valor_original')::numeric,
           (x->>'desconto')::numeric,
           (x->>'valor_final')::numeric,
           nullif(x->>'diferenca_id', '')::bigint
      from jsonb_array_elements(p_inserir) x;
    get diagnostics v_inseridos = row_count;
  end if;

  update cobrancas c
     set valor_bruto = coalesce((select sum(i.valor_original) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_desconto = coalesce((select sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_total = coalesce((select sum(i.valor_original) - sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0)
   where c.id = any (v_rascunhos || v_origens);

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

-- Cobranca sem recebimento: o item muda de preco nela mesma (Julio, 24/11/2026,
-- resposta 2). Mesmo molde de tirar_item_de_cobranca_em_aberto: as travas sao
-- conferidas de novo sob o lock, e null quer dizer "nao deu" (entrou dinheiro
-- no meio): a aplicacao segue pelo caminho da complementar ou do credito.
-- A enviada volta a confirmada, para a Kelly mandar de novo; o texto do
-- WhatsApp e refeito pela aplicacao.
create or replace function public.ajustar_item_pela_troca_de_servico(
  p_item_id bigint,
  p_valor_original numeric,
  p_descricao text
)
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
  if v_status not in ('Confirmada', 'Enviada') then
    return null;
  end if;
  if exists (select 1 from recebimentos where cobranca_id = v_cobranca) then
    return null;
  end if;
  if exists (select 1 from creditos where item_cobranca_id = p_item_id) then
    return null;
  end if;

  update itens_cobranca
     set valor_original = p_valor_original,
         desconto = least(desconto, p_valor_original),
         valor_final = p_valor_original - least(desconto, p_valor_original),
         descricao = p_descricao
   where id = p_item_id;

  update cobrancas c
     set valor_bruto = coalesce((select sum(i.valor_original) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_desconto = coalesce((select sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         valor_total = coalesce((select sum(i.valor_original) - sum(i.desconto) from itens_cobranca i where i.cobranca_id = c.id), 0),
         status = 'Confirmada'
   where c.id = v_cobranca;

  return 'Confirmada';
end;
$$;

grant execute on function public.ajustar_item_pela_troca_de_servico(bigint, numeric, text) to authenticated;
