create type public.tipo_notificacao as enum ('LinkAula', 'BoasVindas', 'Cobranca');
create type public.canal_envio as enum ('WhatsApp', 'E-mail');
create type public.status_notificacao as enum ('Pendente', 'Pronta', 'Enviada', 'Falhou');

-- Fila de mensagens. Nesta fase a gestora copia o texto gerado e envia pelo
-- WhatsApp; o status Enviada existe desde ja para que uma futura integracao
-- com a API apenas automatize a transicao, sem mudar o modelo de dados
-- (Operacionais 4.5 e 6.5).
create table public.notificacoes (
  id bigint generated always as identity primary key,
  tipo public.tipo_notificacao not null,
  canal public.canal_envio not null,
  destinatario_tipo text not null check (destinatario_tipo in ('aluno', 'responsavel')),
  destinatario_id bigint not null,
  agendado_para timestamptz,
  texto_gerado text,
  status public.status_notificacao not null default 'Pendente',
  enviado_em timestamptz,
  referencia_tipo text,
  referencia_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.notificacoes (status, agendado_para);

create trigger tocar_updated_at before update on public.notificacoes
  for each row execute function public.tocar_updated_at();

-- RNF de Logs: registrar geracao e confirmacao de cobrancas, baixas de
-- recebimento e de pagamento, com data/hora e usuario responsavel.
create table public.logs_operacionais (
  id bigint generated always as identity primary key,
  acao text not null,
  entidade text not null,
  entidade_id bigint,
  usuario text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);

create index on public.logs_operacionais (entidade, entidade_id);
create index on public.logs_operacionais (criado_em desc);

alter table public.notificacoes enable row level security;
alter table public.logs_operacionais enable row level security;

create policy "gestora total" on public.notificacoes for all
  using (public.e_gestora()) with check (public.e_gestora());
create policy "gestora le logs" on public.logs_operacionais for select
  using (public.e_gestora());
