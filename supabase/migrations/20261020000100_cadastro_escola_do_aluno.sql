-- Cadastro pelo responsavel, ajuste do Julio (20/10/2026): o responsavel
-- informa a escola do aluno (opcional, so as do catalogo) e escolhe quem
-- recebe os links das aulas. A escolha ja chegava em destinatario_notificacao;
-- falta gravar a escola na aprovacao.
--
-- A escola e conferida de novo aqui: se ela foi apagada entre o envio e a
-- aprovacao, o aluno entra sem escola em vez de a aprovacao falhar na FK.
-- Envios anteriores a este ajuste nao tem escola_id no jsonb: entram sem escola.

create or replace function public.aprovar_envio_cadastro(
  p_envio_id bigint,
  p_responsavel_existente bigint
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_envio envios_cadastro%rowtype;
  v_resp jsonb;
  v_responsavel_id bigint;
  v_aluno jsonb;
begin
  select * into v_envio from envios_cadastro where id = p_envio_id for update;
  if not found then raise exception 'Envio % nao encontrado', p_envio_id; end if;
  if v_envio.status <> 'Pendente' then
    raise exception 'Envio % ja foi decidido (%)', p_envio_id, v_envio.status;
  end if;

  if p_responsavel_existente is not null then
    select id into v_responsavel_id from responsaveis where id = p_responsavel_existente;
    if not found then raise exception 'Responsavel % nao encontrado', p_responsavel_existente; end if;
  else
    v_resp := v_envio.dados->'responsavel';
    insert into responsaveis (nome, telefone, email, cpf, cep, endereco, numero, complemento, bairro, cidade, estado)
    values (
      v_resp->>'nome', v_resp->>'telefone', v_resp->>'email', v_resp->>'cpf', v_resp->>'cep',
      v_resp->>'endereco', v_resp->>'numero', v_resp->>'complemento', v_resp->>'bairro',
      v_resp->>'cidade', v_resp->>'estado'
    )
    returning id into v_responsavel_id;
  end if;

  for v_aluno in select * from jsonb_array_elements(coalesce(v_envio.dados->'alunos', '[]'::jsonb)) loop
    insert into alunos (nome, responsavel_id, telefone, email, data_nascimento, escola_id,
                        destinatario_notificacao, canal_notificacao)
    values (
      v_aluno->>'nome', v_responsavel_id, v_aluno->>'telefone', v_aluno->>'email',
      (v_aluno->>'data_nascimento')::date,
      (select e.id from escolas e where e.id = (v_aluno->>'escola_id')::bigint),
      (v_aluno->>'destinatario_notificacao')::destinatario_notificacao,
      (v_aluno->>'canal_notificacao')::canal_notificacao
    );
  end loop;

  update envios_cadastro
     set status = 'Aprovado', responsavel_id = v_responsavel_id, decidido_em = now(), dados = null
   where id = p_envio_id;

  return v_responsavel_id;
end;
$$;

revoke execute on function public.aprovar_envio_cadastro(bigint, bigint) from public, anon;
grant execute on function public.aprovar_envio_cadastro(bigint, bigint) to authenticated;
