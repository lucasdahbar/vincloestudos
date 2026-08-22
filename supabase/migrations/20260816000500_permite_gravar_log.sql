-- Revisao geral de permissoes pedida no retorno de QA (item C3).
--
-- A tabela de log tinha policy so de SELECT. Toda escrita feita pela gestora
-- — confirmar cobranca, dar baixa, pagar professor, excluir cadastro por LGPD —
-- era silenciosamente recusada pelo RLS. O log tinha UMA linha: a unica escrita
-- que passa pela service role key (o formulario publico de presenca).
--
-- Isso quebrava o RNF de Logs ("registrar geracao e confirmacao de cobrancas,
-- baixas de recebimento e de pagamento, com data/hora e usuario") e, pior,
-- quebrava em silencio: nenhum erro chegava a tela.

create policy "gestora grava log" on public.logs_operacionais
  for insert to authenticated
  with check (public.e_gestora());

-- Log e append-only: nem a gestora altera ou apaga o proprio rastro.
