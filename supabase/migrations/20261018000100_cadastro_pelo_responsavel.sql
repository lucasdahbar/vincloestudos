-- Cadastro pelo proprio responsavel (pedido do Julio, 17-18/10/2026).
--
-- A gestora gera um convite por familia; o responsavel preenche os dados dele
-- e dos alunos por um link publico; o envio cai numa fila e so vira cadastro
-- quando a gestora aprova. As regras (validade, campos obrigatorios) estao em
-- `dominio/cadastro-publico/`.
--
-- Seguranca:
-- - o link carrega um token aleatorio; aqui fica so o hash (sha-256). Quem ler
--   esta tabela nao consegue montar um link valido;
-- - o envio nunca escreve em responsaveis/alunos: um link vazado gera no
--   maximo um item na fila, que a gestora recusa;
-- - o formulario so grava, nunca le dados existentes, entao nao serve para
--   descobrir quem e cliente da escola.

create table public.convites_cadastro (
  id bigint generated always as identity primary key,
  token_hash text not null unique,
  -- Para a gestora reconhecer o convite na lista ("Maria, mae do Joao").
  -- Nao aparece para quem abre o link.
  identificacao text,
  expira_em timestamptz not null,
  usado_em timestamptz,
  cancelado_em timestamptz,
  created_at timestamptz not null default now()
);

create table public.envios_cadastro (
  id bigint generated always as identity primary key,
  -- unique: o convite vale uma vez, garantido tambem pelo banco.
  convite_id bigint not null unique references public.convites_cadastro (id) on delete cascade,
  -- O envio ja validado (EnvioValido). Vira null na aprovacao: os dados passam
  -- a morar em responsaveis/alunos, e uma segunda copia do CPF nao faz falta.
  dados jsonb,
  status text not null default 'Pendente'
    check (status in ('Pendente', 'Aprovado', 'Recusado')),
  responsavel_id bigint references public.responsaveis (id) on delete set null,
  -- Registro do consentimento (LGPD, Art. 8): o texto aceito e quando.
  aceite_texto text not null,
  aceite_em timestamptz not null default now(),
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);

create index on public.envios_cadastro (status);

alter table public.convites_cadastro enable row level security;
create policy "gestora total" on public.convites_cadastro for all
  using (public.e_gestora()) with check (public.e_gestora());

alter table public.envios_cadastro enable row level security;
create policy "gestora total" on public.envios_cadastro for all
  using (public.e_gestora()) with check (public.e_gestora());

-- ── Envio pelo link publico ─────────────────────────────────────────────────
-- Marcar o convite como usado e gravar o envio na mesma transacao: dois
-- cliques seguidos (ou o link aberto em dois celulares) nao geram dois envios.
-- So o servidor chama, com a service role: anon e authenticated nao executam.
create or replace function public.registrar_envio_cadastro(
  p_token_hash text,
  p_dados jsonb,
  p_aceite_texto text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_convite convites_cadastro%rowtype;
begin
  select * into v_convite from convites_cadastro
   where token_hash = p_token_hash
   for update;

  if not found then return 'inexistente'; end if;
  if v_convite.usado_em is not null then return 'usado'; end if;
  if v_convite.cancelado_em is not null then return 'cancelado'; end if;
  if v_convite.expira_em < now() then return 'expirado'; end if;

  update convites_cadastro set usado_em = now() where id = v_convite.id;
  insert into envios_cadastro (convite_id, dados, aceite_texto)
  values (v_convite.id, p_dados, p_aceite_texto);

  return 'ok';
end;
$$;

revoke execute on function public.registrar_envio_cadastro(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.registrar_envio_cadastro(text, jsonb, text) to service_role;

-- ── Aprovacao pela gestora ──────────────────────────────────────────────────
-- Cria o responsavel e os alunos de uma vez: um erro no meio deixaria um
-- responsavel sem os filhos. Com p_responsavel_existente, os alunos entram no
-- cadastro que ja existe e os dados dele NAO sao alterados: quem tem o link
-- nao pode sobrescrever o cadastro de outra pessoa.
-- security invoker: quem pode chamar e decidido pelas policies "gestora total".
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
    insert into alunos (nome, responsavel_id, telefone, email, data_nascimento,
                        destinatario_notificacao, canal_notificacao)
    values (
      v_aluno->>'nome', v_responsavel_id, v_aluno->>'telefone', v_aluno->>'email',
      (v_aluno->>'data_nascimento')::date,
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
