-- QA Rodada 1, itens C1, M3 e M4: endereco passa a ser preenchido por CEP,
-- e o cadastro de Cidades deixa de existir.
--
-- O cadastro de Cidades nunca foi util: a v1.0 ja especificava o endereco do
-- Responsavel como texto livre preenchido pelo CEP, e so a Escola usava
-- cidade_id como FK. Manter uma tabela de apoio so para isso obrigava a
-- pre-carregar 177 municipios e a casar o retorno do ViaCEP com um registro
-- existente. Decisao da gestora: remover a dependencia.

-- ── Responsaveis: quebra o endereco unico nos campos da Secao 5.1 ───────────
alter table public.responsaveis
  add column if not exists cep text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists estado char(2);

comment on column public.responsaveis.endereco is
  'Logradouro. Preenchido pela busca de CEP, editavel depois.';

-- Preserva o que ja estava gravado: a cidade vinha da FK.
update public.responsaveis r
   set cidade = c.nome,
       estado = c.uf
  from public.cidades c
 where r.cidade_id = c.id
   and r.cidade is null;

alter table public.responsaveis drop column if exists cidade_id;

-- ── Escolas: ganha o mesmo bloco de endereco (Secao 5 do retorno de QA) ─────
alter table public.escolas
  add column if not exists cep text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists estado char(2);

update public.escolas e
   set cidade = c.nome,
       estado = c.uf
  from public.cidades c
 where e.cidade_id = c.id
   and e.cidade is null;

alter table public.escolas drop column if exists cidade_id;

-- ── Cidades sai de cena ────────────────────────────────────────────────────
drop table if exists public.cidades;
