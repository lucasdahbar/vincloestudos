-- QA Rodada 1, item C3: "permission denied for table
-- professor_percentual_historico" ao salvar o percentual de repasse.
--
-- Causa: a migration de RLS revoga SELECT da tabela de historico para
-- `authenticated`, para que um professor nao leia o repasse dos colegas. Mas o
-- trigger que mantem a vigencia roda com os direitos de QUEM SALVA — a gestora
-- autenticada — e precisa de SELECT/INSERT/UPDATE ali. Dai o erro de GRANT
-- (nao de RLS: a mensagem seria outra).
--
-- Correcao: as funcoes de vigencia passam a SECURITY DEFINER, rodando com os
-- direitos do dono da tabela. E o desenho correto de qualquer forma — o
-- historico e dado derivado, mantido pelo banco, e a aplicacao nunca deveria
-- escrever nele diretamente.

create or replace function public.registrar_vigencia_servico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.valor_padrao = old.valor_padrao then
    return new;
  end if;

  update public.servico_valor_historico
     set vigencia_fim = current_date - 1
   where servico_id = new.id
     and vigencia_fim is null
     and vigencia_inicio < current_date;

  delete from public.servico_valor_historico
   where servico_id = new.id
     and vigencia_inicio = current_date;

  insert into public.servico_valor_historico (servico_id, valor, vigencia_inicio)
  values (new.id, new.valor_padrao, current_date);

  return new;
end;
$$;

create or replace function public.registrar_vigencia_professor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.percentual_repasse = old.percentual_repasse then
    return new;
  end if;

  update public.professor_percentual_historico
     set vigencia_fim = current_date - 1
   where professor_id = new.id
     and vigencia_fim is null
     and vigencia_inicio < current_date;

  delete from public.professor_percentual_historico
   where professor_id = new.id
     and vigencia_inicio = current_date;

  insert into public.professor_percentual_historico (professor_id, percentual, vigencia_inicio)
  values (new.id, new.percentual_repasse, current_date);

  return new;
end;
$$;
