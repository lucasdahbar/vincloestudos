-- Corrige recorrencia_coerente: num CHECK, "intervalo between 1 and 99" com
-- intervalo nulo da NULL, e o CHECK aceita NULL. Sem o "is not null" explicito,
-- uma turma recorrente sem intervalo passaria.

alter table public.turmas drop constraint recorrencia_coerente;
alter table public.turmas add constraint recorrencia_coerente check (
  (tipo_recorrencia = 'Recorrente'
     and data_unica is null
     and frequencia is not null
     and intervalo is not null
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
