-- Decisao 3 do Julio (28/10/2026): a conta a pagar do professor ganha
-- rascunho, como a cobranca. O valor novo do enum so pode ser usado na
-- proxima transacao: o resto vem na migracao seguinte.
alter type public.status_conta_pagar add value if not exists 'Rascunho';
