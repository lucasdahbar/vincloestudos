-- Ajustes aos Modulos Operacionais, Rodada 2. Um item por bloco, com o codigo
-- do documento, para dar para cruzar depois.

-- ── T1: turma como evento unico ou recorrente ───────────────────────────────
create type public.tipo_recorrencia as enum ('Único', 'Recorrente');

alter table public.turmas
  add column if not exists tipo_recorrencia public.tipo_recorrencia not null default 'Recorrente',
  add column if not exists data_unica date;

comment on column public.turmas.data_unica is
  'Data do evento quando tipo_recorrencia = Unico. Cobre aulao avulso sem exigir um segundo fluxo de cadastro.';

-- A regra "Ativa exige dia da semana" so vale para recorrente; evento unico
-- tem data_unica no lugar.
alter table public.turmas drop constraint if exists ativa_exige_dia;
alter table public.turmas add constraint recorrencia_coerente check (
  (tipo_recorrencia = 'Recorrente'
     and data_unica is null
     and (status <> 'Ativa' or cardinality(dias_semana) >= 1))
  or
  (tipo_recorrencia = 'Único' and data_unica is not null)
);

-- ── G1: agenda do Google por professor · R1: link pessoal de presenca ───────
alter table public.professores
  add column if not exists google_calendar_id text,
  add column if not exists token_presenca text;

comment on column public.professores.google_calendar_id is
  'Agenda secundaria do Google daquele professor. A gestora mantem essas agendas fora do sistema.';
comment on column public.professores.token_presenca is
  'Link pessoal e PERMANENTE de presenca (R1). Enviado uma vez, cobre todas as turmas do professor, inclusive as futuras. Regerar invalida o anterior.';

create unique index if not exists professores_google_calendar_id_key
  on public.professores (google_calendar_id) where google_calendar_id is not null;
create unique index if not exists professores_token_presenca_key
  on public.professores (token_presenca) where token_presenca is not null;

-- ── M2: matricula de um dia so ─────────────────────────────────────────────
-- A regra antiga exigia data_fim > data_inicio, o que barrava o aluno que
-- participa de um unico aulao avulso.
alter table public.matriculas drop constraint if exists periodo_coerente;
alter table public.matriculas add constraint periodo_coerente
  check (data_fim is null or data_fim >= data_inicio);

-- ── M1: matriculas do mesmo par (aluno, turma) nao podem se sobrepor ────────
--
-- Feito por trigger, e nao por constraint de exclusao, de proposito: a base ja
-- tem uma sobreposicao real (mesmo aluno, mesma turma, dois periodos que se
-- cruzam). Uma constraint recusaria criar a si mesma e obrigaria a apagar um
-- registro da gestora antes da migration rodar — decisao que nao cabe ao
-- desenvolvedor tomar sozinho.
--
-- O trigger barra toda sobreposicao NOVA, na criacao e na edicao, como o
-- documento pede; o conflito antigo fica visivel para ela resolver.
create or replace function public.impedir_matricula_sobreposta()
returns trigger
language plpgsql
as $$
declare
  conflitos integer;
begin
  select count(*) into conflitos
    from public.matriculas m
   where m.aluno_id = new.aluno_id
     and m.turma_id = new.turma_id
     and m.id is distinct from new.id
     -- Sem data_fim = "sem data prevista para terminar" (documento, 5.1).
     and daterange(m.data_inicio, m.data_fim, '[]')
      && daterange(new.data_inicio, new.data_fim, '[]');

  if conflitos > 0 then
    raise exception 'Este aluno já possui uma matrícula nesta turma no período informado. Encerre a matrícula atual antes de criar uma nova.';
  end if;

  return new;
end;
$$;

create trigger impedir_sobreposicao
  before insert or update of aluno_id, turma_id, data_inicio, data_fim
  on public.matriculas
  for each row execute function public.impedir_matricula_sobreposta();

-- ── P1: presenca reservada por um fechamento ───────────────────────────────
alter table public.presencas
  add column if not exists conta_pagar_id bigint
    references public.contas_pagar_professor (id) on delete set null;

comment on column public.presencas.conta_pagar_id is
  'Fechamento que ja reservou esta presenca (P1). E o que impede pagar a mesma presenca duas vezes, mesmo com periodos sobrepostos.';

create index if not exists presencas_conta_pagar_idx on public.presencas (conta_pagar_id);

-- ── C7 e P5: cancelamento ──────────────────────────────────────────────────
alter type public.status_cobranca add value if not exists 'Cancelada';
alter type public.status_conta_pagar add value if not exists 'Parcial';
alter type public.status_conta_pagar add value if not exists 'Cancelada';

-- ── C1: cobrancas complementares no mesmo mes ──────────────────────────────
-- Deixa de haver uma cobranca por responsavel por mes: matricula feita no meio
-- do mes gera uma cobranca adicional, sem reabrir a que ja foi confirmada.
alter table public.cobrancas drop constraint if exists cobrancas_responsavel_id_mes_referencia_key;
alter table public.cobrancas add column if not exists complementar boolean not null default false;

comment on column public.cobrancas.complementar is
  'Marca a cobranca adicional do mes, para o texto do WhatsApp avisar que nao e duplicidade.';

-- ── C5: conta que recebe (define a chave Pix do texto) ─────────────────────
alter table public.contas add column if not exists padrao_recebimento boolean not null default false;

comment on column public.contas.padrao_recebimento is
  'Conta sugerida ao gerar cobranca. So uma pode ser a padrao.';

create unique index if not exists contas_uma_padrao_recebimento
  on public.contas (padrao_recebimento) where padrao_recebimento;

alter table public.cobrancas
  add column if not exists conta_recebimento_id bigint references public.contas (id) on delete set null;
