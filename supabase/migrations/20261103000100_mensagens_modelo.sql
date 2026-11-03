-- Textos das mensagens editaveis pela gestora (pedido de 03/11/2026).
--
-- So guarda o que foi EDITADO: sem linha para a chave, vale o texto original
-- que mora no codigo (`dominio/mensagens-modelo/catalogo.ts`). "Restaurar o
-- original" e apagar a linha. As chaves validas tambem sao conferidas la, nao
-- aqui: um enum no banco obrigaria uma migracao a cada mensagem nova.
create table public.mensagens_modelo (
  chave text primary key,
  texto text not null check (btrim(texto) <> ''),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

alter table public.mensagens_modelo enable row level security;

create policy "gestora total" on public.mensagens_modelo for all
  using (public.e_gestora()) with check (public.e_gestora());

-- O professor logado ve telas que montam estas mensagens (ex.: o link da
-- chamada). O texto nao tem dado pessoal nem segredo; so a gestora escreve.
create policy "logado le" on public.mensagens_modelo for select
  using (auth.uid() is not null);
