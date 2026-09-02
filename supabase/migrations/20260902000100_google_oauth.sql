-- Autorizacao do Google Agenda (G2).
--
-- Uma linha so: a conta Google da empresa. O refresh token e o segredo que
-- permite escrever nas agendas dos professores, entao a tabela fica SEM
-- policy nenhuma — nem a gestora le por aqui. So o service role, do servidor,
-- alcanca. RLS ligada sem policy nega tudo por padrao, que e o que se quer.
create table public.google_oauth (
  id smallint primary key default 1,
  refresh_token text not null,
  -- Conta que autorizou, para a tela dizer o que esta conectado.
  email text,
  escopo text,
  conectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint uma_linha_so check (id = 1)
);

comment on table public.google_oauth is
  'Autorizacao OAuth da conta Google da empresa. Sem policy de proposito: o
   refresh token so pode ser lido pelo servidor, com o service role.';

alter table public.google_oauth enable row level security;
