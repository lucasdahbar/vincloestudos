-- Link da videochamada da turma.
--
-- G2 (criar o evento no Google Agenda pelo sistema) depende da autorizacao
-- OAuth, que ainda nao foi feita. Ate la a gestora cria o evento a mao, como ja
-- faz hoje, e cola aqui o link do Meet — que e o que o professor precisa
-- receber no aviso de turma nova (G4).
--
-- Quando G2 entrar, e esta mesma coluna que o sistema vai preencher sozinho.
alter table public.turmas add column if not exists link_videochamada text;

comment on column public.turmas.link_videochamada is
  'Link do Google Meet da turma. Preenchido a mao ate G2 (criacao automatica do
   evento) entrar; depois, escrito pelo proprio sistema.';
