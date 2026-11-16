-- Caso Alice (16/11/2026): a matricula dela na turma de Matematica sumiu
-- depois de tres chamadas com presenca, as aulas ficaram fora da cobranca e
-- nao havia como saber quem apagou nem quando. Matricula se apaga por varios
-- caminhos (desmatricular, cancelar reposicao, excluir turma), entao o rastro
-- fica no banco, num gatilho, e pega todos eles, inclusive os que nao
-- conhecemos.
--
-- Registra a exclusao e a mudanca de turma ou de datas, com a linha antiga
-- inteira: com ela da para recriar a matricula.

create or replace function public.registrar_log_de_matricula()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.turma_id = new.turma_id
     and old.data_inicio = new.data_inicio
     and old.data_fim is not distinct from new.data_fim then
    return new;
  end if;

  insert into public.logs_operacionais (acao, entidade, entidade_id, usuario, detalhe)
  values (
    case tg_op when 'DELETE' then 'excluir_matricula' else 'alterar_matricula' end,
    'matriculas',
    old.id,
    -- Sem sessao (service role, script) fica o papel do banco.
    coalesce(auth.jwt() ->> 'email', current_user),
    case tg_op
      when 'DELETE' then jsonb_build_object('antes', to_jsonb(old))
      else jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new))
    end
  );
  return coalesce(new, old);
end;
$$;

create trigger matriculas_log
  after update or delete on public.matriculas
  for each row execute function public.registrar_log_de_matricula();
