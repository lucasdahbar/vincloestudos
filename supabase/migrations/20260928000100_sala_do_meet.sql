-- G3 (Rodada 2): sala do Google Meet criada pelo sistema para turma online.
--
-- Guarda o nome da sala na API do Meet (`spaces/...`), não o link. O link já
-- vai em `link_videochamada`; o nome é o que permite voltar à sala depois —
-- trocar o coorganizador quando o professor da turma muda.
--
-- Nulo quando a turma é presencial, quando a gestora colou um link à mão ou
-- quando a turma é anterior a G3.
alter table public.turmas add column if not exists google_meet_sala text;

comment on column public.turmas.google_meet_sala is
  'Nome da sala na API do Google Meet (spaces/...), criada pelo sistema com o
   professor como coorganizador. Nulo se o link foi colado a mao.';
