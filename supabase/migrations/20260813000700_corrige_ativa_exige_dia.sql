-- Corrige a constraint `ativa_exige_dia`, que nunca barrava nada.
--
-- `array_length('{}'::smallint[], 1)` devolve NULL, nao 0. Uma CHECK constraint
-- so bloqueia a linha quando a expressao resulta em FALSE — NULL e tratado como
-- satisfeito. Entao, para uma turma Ativa com dias_semana vazio, a expressao
-- `false or (NULL >= 1)` virava NULL e o INSERT passava.
--
-- `cardinality` devolve 0 para array vazio e nao tem essa armadilha.
--
-- A validacao de dominio (validarTurma) ja bloqueava esse caso na aplicacao;
-- esta constraint e a defesa em profundidade, para escrita direta no banco.

alter table public.turmas drop constraint ativa_exige_dia;

alter table public.turmas add constraint ativa_exige_dia check (
  status <> 'Ativa' or cardinality(dias_semana) >= 1
);
