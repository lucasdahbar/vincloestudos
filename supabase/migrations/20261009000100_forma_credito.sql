-- Abater credito do responsavel numa cobranca vira um recebimento com esta
-- forma de pagamento (ver 20261009000200).
--
-- Migracao separada porque o Postgres nao deixa usar um valor de enum na mesma
-- transacao em que ele foi criado, e a seguinte ja o usa numa restricao.
alter type public.forma_pagamento add value if not exists 'Crédito';
