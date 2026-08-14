-- Corrige a chave de idempotencia de itens_cobranca.
--
-- O documento de requisitos (Operacionais 2.2 e 6.2) diz que "uma aula so pode
-- ser cobrada uma vez" e marca aula_id como unico. Isso funciona para aula
-- individual, mas Turma e um GRUPO: uma mesma aula atende varios alunos
-- matriculados, de responsaveis diferentes, e cada um precisa ser cobrado.
--
-- Com UNIQUE(aula_id), a segunda cobranca de uma turma com dois alunos falhava
-- com violacao de unicidade — o sistema so conseguia faturar o primeiro aluno
-- de cada turma.
--
-- A intencao da regra e impedir cobrar a MESMA AULA DO MESMO ALUNO duas vezes.
-- UNIQUE(aula_id, aluno_id) preserva integralmente essa garantia de
-- idempotencia (reprocessar o mes nao duplica item) e passa a suportar turma
-- com mais de um aluno.

alter table public.itens_cobranca drop constraint itens_cobranca_aula_id_key;

alter table public.itens_cobranca
  add constraint itens_cobranca_aula_aluno_key unique (aula_id, aluno_id);

comment on constraint itens_cobranca_aula_aluno_key on public.itens_cobranca is
  'Idempotencia da cobranca: uma aula nao pode ser cobrada duas vezes do mesmo
   aluno. Turma e grupo, entao a mesma aula gera um item por aluno matriculado.';
