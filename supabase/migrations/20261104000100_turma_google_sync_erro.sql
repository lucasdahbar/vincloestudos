-- Falha ao atualizar a agenda do Google (bug de 04/11/2026).
--
-- A atualizacao do Google roda depois de salvar a turma, e quando falhava o
-- motivo so ia para o log do servidor: a turma 182 ficou dias com
-- "Nenhum aluno matriculado" num dia com aluno e ninguem soube. Agora a
-- falha fica gravada na turma, para a tela avisar a gestora e oferecer
-- "Refazer no Google". Sucesso apaga os dois campos.
alter table public.turmas
  add column google_sync_erro text,
  add column google_sync_erro_em timestamptz;

comment on column public.turmas.google_sync_erro is
  'Motivo da ultima falha ao atualizar o Google Agenda; null quando esta em dia.';
