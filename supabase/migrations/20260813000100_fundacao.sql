-- Fundacao: trigger de updated_at e tipos enumerados usados em todo o schema.

create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.tocar_updated_at is
  'Mantem updated_at atualizado. Aplicada por trigger em todas as tabelas.';

create type public.modalidade as enum ('Presencial', 'Online');
create type public.status_turma as enum ('Ativa', 'Encerrada');
create type public.status_matricula as enum ('Ativa', 'Encerrada');
create type public.destinatario_notificacao as enum ('Aluno', 'Responsável', 'Ambos');
create type public.canal_notificacao as enum ('WhatsApp', 'E-mail', 'Ambos');
create type public.tipo_conta as enum ('Banco', 'Dinheiro', 'Carteira digital');
create type public.abrangencia_feriado as enum ('Nacional', 'Estadual', 'Municipal');
create type public.papel_usuario as enum ('gestora', 'professor');
