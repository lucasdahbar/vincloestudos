-- QA Rodada 1, item C3 (revisao geral de permissoes pedida no documento).
--
-- A revisao encontrou o professor enxergando `servico_valor_historico`, ou
-- seja, a tabela de precos. Ele nao precisa: o acesso dele e a agenda das
-- proprias turmas e o proprio fechamento. Menor privilegio.
--
-- Continua vendo `contas_pagar_professor` filtrado pelas dele — isso e
-- intencional (Operacionais, Navegacao entre Modulos, Professor -> Contas a
-- Pagar).

drop policy if exists "autenticado le" on public.servico_valor_historico;
