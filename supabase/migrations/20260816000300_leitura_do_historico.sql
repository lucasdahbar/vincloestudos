-- QA Rodada 1, item C3 (segunda parte): a gestora tambem nao conseguia LER o
-- historico de repasse.
--
-- A migration de RLS revogou SELECT de `authenticated` para esconder o repasse
-- de um professor dos colegas. Mas `authenticated` inclui a gestora, entao ela
-- perdeu o acesso junto.
--
-- Revogar GRANT e a ferramenta errada aqui: ela nao distingue papel. A policy
-- de RLS ja distingue — `e_gestora()` e falso para professor. Devolvemos o
-- GRANT e deixamos o RLS decidir, que e a camada que sabe quem esta pedindo.

grant select on public.professor_percentual_historico to authenticated;
grant select on public.servico_valor_historico to authenticated;

-- Sem policy para professor, o RLS nega por padrao: so "gestora total" libera.
