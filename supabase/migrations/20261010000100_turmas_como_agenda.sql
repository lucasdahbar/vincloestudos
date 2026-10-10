-- Rodada 4: turmas como agenda (spec 2026-10-09-turmas-como-agenda-design.md).
--
-- A turma recorrente passa a ter uma regra no desenho do Google Agenda:
-- frequencia + "a cada N" + periodo. O fim e sempre gravado; quando a gestora
-- nao informa, o sistema usa 31/12 e marca fim_automatico, para a renovacao
-- de fim de ano saber quais turmas oferecer.

create type public.frequencia_turma as enum ('Diária', 'Semanal', 'Mensal');

alter table public.turmas
  add column frequencia public.frequencia_turma,
  add column intervalo smallint,
  add column data_inicio date,
  add column data_fim date,
  add column fim_automatico boolean not null default false;

comment on column public.turmas.intervalo is
  '"A cada N" dias/semanas/meses. Quinzenal = Semanal com intervalo 2.';
comment on column public.turmas.data_inicio is
  'Primeiro dia da recorrencia. Pode ser anterior ao cadastro (aulas retroativas).';
comment on column public.turmas.fim_automatico is
  'true quando a gestora nao informou fim e o sistema usou 31/12. So estas entram na renovacao.';

-- Turmas que ja existem: semanais, desde o dia do cadastro (a regra que valia
-- ate aqui, decisao de 22/09/2026), ate o fim do ano.
update public.turmas
   set frequencia = 'Semanal',
       intervalo = 1,
       data_inicio = (created_at at time zone 'America/Sao_Paulo')::date,
       data_fim = '2026-12-31',
       fim_automatico = true
 where tipo_recorrencia = 'Recorrente';

alter table public.turmas drop constraint recorrencia_coerente;
alter table public.turmas add constraint recorrencia_coerente check (
  (tipo_recorrencia = 'Recorrente'
     and data_unica is null
     and frequencia is not null
     and intervalo between 1 and 99
     and data_inicio is not null
     and data_fim is not null
     and data_fim >= data_inicio
     -- Dia da semana so faz sentido na semanal; nas outras a data de inicio
     -- e que ancora a repeticao.
     and (case frequencia
            when 'Semanal' then status <> 'Ativa' or cardinality(dias_semana) >= 1
            else cardinality(dias_semana) = 0
          end))
  or
  (tipo_recorrencia = 'Único'
     and data_unica is not null
     and frequencia is null
     and intervalo is null
     and data_inicio is null
     and data_fim is null
     and not fim_automatico)
);

-- Compatibilidade: o banco e compartilhado com o codigo em producao, que ate o
-- deploy desta rodada grava turma recorrente sem os campos novos. Sem isto, a
-- constraint acima recusaria toda turma nova criada pela gestora. Preenche como
-- era antes (semanal, desde hoje, ate 31/12). Inofensivo depois do deploy: o
-- codigo novo sempre manda os campos.
create or replace function public.preencher_regra_da_turma()
returns trigger
language plpgsql
as $$
begin
  if new.tipo_recorrencia = 'Recorrente' and new.frequencia is null then
    new.frequencia := 'Semanal';
    new.intervalo := coalesce(new.intervalo, 1);
    new.data_inicio := coalesce(new.data_inicio, (now() at time zone 'America/Sao_Paulo')::date);
    new.data_fim := coalesce(new.data_fim, make_date(extract(year from new.data_inicio)::int, 12, 31));
    new.fim_automatico := true;
  elsif new.tipo_recorrencia = 'Único' then
    new.frequencia := null;
    new.intervalo := null;
    new.data_inicio := null;
    new.data_fim := null;
    new.fim_automatico := false;
  end if;
  return new;
end;
$$;

create trigger preencher_regra_da_turma
  before insert or update on public.turmas
  for each row execute function public.preencher_regra_da_turma();

-- Aula excluida: a linha fica, para segurar as reposicoes que nasceram dela
-- (pendencias_reposicao.aula_origem_id e on delete cascade) e para a
-- materializacao (upsert com ignoreDuplicates) nao recria-la.
alter type public.status_aula add value if not exists 'Excluída';

-- Pendencia criada quando a aula do aluno e excluida pela gestora.
alter type public.origem_ausencia add value if not exists 'Exclusão';
