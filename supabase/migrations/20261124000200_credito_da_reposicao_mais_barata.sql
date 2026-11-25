-- Reposicao em turma mais barata (Julio, 24/11/2026): a Kelly decide ao marcar
-- se a diferenca volta como credito, e o credito so nasce com a presenca na
-- reposicao. Regra em dominio/reposicoes/credito-da-diferenca.ts.
--
-- O credito NAO usa creditos.pendencia_id: ali ele quer dizer "a aula perdida
-- virou credito", e trava a correcao da chamada e o cancelamento do aviso.
-- Este e outro: a familia fez a reposicao, so que numa aula mais barata.

alter table public.pendencias_reposicao
  -- Nulo: o destino nao e mais barato. true/false: a resposta da Kelly.
  add column credito_diferenca boolean,
  add column credito_diferenca_id bigint unique references public.creditos (id) on delete set null;
