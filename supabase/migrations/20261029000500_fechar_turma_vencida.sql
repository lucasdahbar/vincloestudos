-- Etapa 4 de "turmas como agenda" (28/10/2026): a turma que terminou fecha
-- sozinha. A aula unica que ja passou e a serie cujo fim a gestora escolheu
-- (encerramento com data futura) viram Encerradas quando a data passa. A
-- serie com o fim de 31/12 posto pelo sistema fica para a renovacao.
--
-- E o mesmo fechamento de `encerrar_turma` quando a data ja chegou, sem as
-- aulas: o fim ja foi gravado antes, e nao ha aula depois dele. A regra mora
-- em `dominio/turmas/lista.ts` (turmaVencida); aqui ela e conferida de novo,
-- com a turma travada, para a funcao nunca fechar uma turma que ainda vale.
-- O Google nao e tocado: o evento da turma encerrada com fim no passado fica.
create or replace function public.fechar_turma_vencida(p_turma_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turma record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim date;
begin
  select id, tipo_recorrencia, data_unica, data_fim, fim_automatico, status into v_turma
    from turmas where id = p_turma_id for update;

  if not found or v_turma.status <> 'Ativa' then
    return false;
  end if;

  if v_turma.tipo_recorrencia = 'Único' then
    v_fim := v_turma.data_unica;
  elsif not v_turma.fim_automatico then
    v_fim := v_turma.data_fim;
  end if;

  if v_fim is null or v_fim >= v_hoje then
    return false;
  end if;

  -- Matricula que so comecaria depois do fim nunca teve aula; as demais
  -- terminam no fim da turma. Elas continuam Ativas de proposito: a lista da
  -- aula le so matricula ativa, e a aula que passou sem chamada (o professor
  -- esqueceu) ainda precisa dos alunos para a chamada ser feita.
  delete from matriculas
   where turma_id = p_turma_id and status = 'Ativa' and data_inicio > v_fim;

  update matriculas
     set data_fim = v_fim
   where turma_id = p_turma_id
     and status = 'Ativa'
     and (data_fim is null or data_fim > v_fim);

  update turmas set status = 'Encerrada' where id = p_turma_id;
  return true;
end;
$$;
