-- Corrige a consulta de vigencia para datas anteriores ao primeiro registro.
--
-- O historico de vigencia comeca no dia em que o servico (ou o professor) foi
-- cadastrado. Uma aula anterior a essa data nao era coberta por nenhuma
-- vigencia, e a funcao devolvia NULL — o que quebrava a geracao de cobranca
-- (valor_original tem CHECK > 0) e zerava o repasse do professor.
--
-- Isso e comum na pratica: o negocio ja existia antes do sistema, e a agenda e
-- materializada para tras. A regra correta e que o primeiro preco cadastrado
-- vale retroativamente, ate a primeira mudanca registrada.
--
-- Datas POSTERIORES continuam usando a vigencia que as cobre, entao o historico
-- de reajustes segue sendo respeitado (RN 6.2 e 8.2).

create or replace function public.valor_servico_em(p_servico_id bigint, p_data date)
returns numeric
language sql
stable
as $$
  select coalesce(
    -- Vigencia que cobre a data pedida.
    (
      select h.valor
        from public.servico_valor_historico h
       where h.servico_id = p_servico_id
         and h.vigencia_inicio <= p_data
         and (h.vigencia_fim is null or h.vigencia_fim >= p_data)
       order by h.vigencia_inicio desc
       limit 1
    ),
    -- Data anterior a tudo: vale o primeiro valor cadastrado.
    (
      select h.valor
        from public.servico_valor_historico h
       where h.servico_id = p_servico_id
       order by h.vigencia_inicio asc
       limit 1
    )
  );
$$;

create or replace function public.percentual_professor_em(p_professor_id bigint, p_data date)
returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select h.percentual
        from public.professor_percentual_historico h
       where h.professor_id = p_professor_id
         and h.vigencia_inicio <= p_data
         and (h.vigencia_fim is null or h.vigencia_fim >= p_data)
       order by h.vigencia_inicio desc
       limit 1
    ),
    (
      select h.percentual
        from public.professor_percentual_historico h
       where h.professor_id = p_professor_id
       order by h.vigencia_inicio asc
       limit 1
    )
  );
$$;
