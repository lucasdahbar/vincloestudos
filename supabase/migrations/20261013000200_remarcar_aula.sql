-- Remarcar uma aula (pedido do tio, 13/10/2026; spec 2026-10-13-remarcar-aula).
--
-- A aula muda de dia e horario, mas a chave (google_calendar_event_id) continua
-- a original: a geracao automatica nao recria a aula no dia de antes.

alter table public.aulas
  add column data_hora_original timestamptz,
  add column google_evento_avulso_id text,
  -- A data que vale para matricula e cobranca: a original, quando remarcada.
  add column data_hora_referencia timestamptz
    generated always as (coalesce(data_hora_original, data_hora_inicio)) stored;

comment on column public.aulas.data_hora_original is
  'Horario que a regra da turma deu a aula, preenchido quando ela e remarcada. Nulo = no horario de sempre.';
comment on column public.aulas.google_evento_avulso_id is
  'Evento avulso da aula remarcada na agenda do professor. O dia original vira EXDATE da serie.';

create index on public.aulas (data_hora_referencia);
