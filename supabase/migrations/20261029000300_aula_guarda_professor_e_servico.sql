-- Etapa 2 de "turmas como agenda" (28/10/2026): a aula guarda o proprio
-- professor e o proprio servico.
--
-- Antes, o pagamento lia `turmas.professor_id` no dia do fechamento e a
-- cobranca lia `turmas.servico_id` no dia da geracao: trocar o professor da
-- turma no meio do mes mandava as aulas ja dadas para o professor novo. Agora
-- a aula dada fica com quem a deu.
--
-- As aulas existentes recebem o professor e o servico atuais da turma. Em
-- 29/10/2026 nenhum fechamento de professor tinha sido feito, entao nao ha
-- pagamento contradizendo isso.

alter table public.aulas
  add column professor_id bigint references public.professores (id) on delete restrict,
  add column servico_id bigint references public.servicos (id) on delete restrict;

update public.aulas a
   set professor_id = t.professor_id, servico_id = t.servico_id
  from public.turmas t
 where t.id = a.turma_id;

alter table public.aulas
  alter column professor_id set not null,
  alter column servico_id set not null;

create index on public.aulas (professor_id);

-- A aula nasce com o professor e o servico da turma. No banco, e nao na
-- aplicacao: a sincronizacao grava aulas em lote e nao precisa saber disso.
create or replace function public.aula_herda_da_turma()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.professor_id is null or new.servico_id is null then
    select coalesce(new.professor_id, t.professor_id), coalesce(new.servico_id, t.servico_id)
      into new.professor_id, new.servico_id
      from turmas t
     where t.id = new.turma_id;
  end if;
  return new;
end;
$$;

create trigger aula_herda_da_turma
  before insert on public.aulas
  for each row execute function public.aula_herda_da_turma();

-- Trocar o professor ou o servico da turma vale dali em diante: so as aulas
-- de hoje (fuso da escola) para frente, ainda agendadas e sem chamada. A aula
-- passada fica como foi; corrigir uma delas e decisao por aula (decisoes 7 e
-- 8, etapa 6).
create or replace function public.turma_propaga_para_aulas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update aulas a
     set professor_id = new.professor_id,
         servico_id = new.servico_id
   where a.turma_id = new.id
     and a.status = 'Agendada'
     and a.data_hora_inicio::date >= (now() at time zone 'America/Sao_Paulo')::date
     and not exists (select 1 from presencas p where p.aula_id = a.id);
  return new;
end;
$$;

create trigger turma_propaga_para_aulas
  after update of professor_id, servico_id on public.turmas
  for each row
  when (old.professor_id is distinct from new.professor_id or old.servico_id is distinct from new.servico_id)
  execute function public.turma_propaga_para_aulas();
