-- G4 (Rodada 2): e-mail ao professor quando uma turma nova e criada.
--
-- A fila de notificacoes existente so aceitava aluno e responsavel como
-- destinatario. O professor entra agora como terceiro tipo, em vez de ganhar
-- uma fila propria: e a mesma mensagem esperando o mesmo envio, e uma segunda
-- fila significaria duas telas para a gestora acompanhar.

alter type public.tipo_notificacao add value if not exists 'TurmaCriada';

alter table public.notificacoes drop constraint if exists notificacoes_destinatario_tipo_check;
alter table public.notificacoes add constraint notificacoes_destinatario_tipo_check
  check (destinatario_tipo in ('aluno', 'responsavel', 'professor'));
