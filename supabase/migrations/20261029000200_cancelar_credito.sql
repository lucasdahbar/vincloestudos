-- O cancelamento, como a devolucao, nao passa por recebimento.
alter table public.usos_credito drop constraint uso_coerente;
alter table public.usos_credito
  add constraint uso_coerente check (
    (tipo = 'Abatimento' and recebimento_id is not null)
    or (tipo in ('Devolução', 'Cancelamento') and recebimento_id is null)
  );
