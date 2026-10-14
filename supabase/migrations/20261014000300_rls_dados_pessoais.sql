-- Revisao de seguranca (14/10/2026): "autenticado le" deixava qualquer usuario
-- logado ler todos os responsaveis e alunos (CPF, telefone, endereco) e todos os
-- professores (CPF, Pix, token_presenca do link permanente). O RLS filtra linhas,
-- nao colunas, e a gestora usa o mesmo papel authenticated, entao a restricao e
-- por linha: o professor ve so o que as telas dele usam.

-- Responsaveis: nenhuma tela do professor le. So a gestora.
drop policy if exists "autenticado le" on public.responsaveis;

-- Alunos: o professor ve os alunos matriculados nas turmas dele (lista da aula,
-- detalhe da turma), inclusive a matricula de reposicao na turma de destino.
drop policy if exists "autenticado le" on public.alunos;
create policy "professor le alunos de suas turmas" on public.alunos
  for select to authenticated using (
    exists (
      select 1
        from public.matriculas m
        join public.turmas t on t.id = m.turma_id
       where m.aluno_id = alunos.id
         and t.professor_id = public.professor_do_usuario()
    )
  );

-- Professores: cada professor ve so o proprio cadastro. As telas dele so
-- mostram as proprias turmas, entao o nome dos colegas nao faz falta.
drop policy if exists "professor le colegas sem financeiro" on public.professores;
drop policy if exists "autenticado le" on public.professores;
create policy "professor le o proprio cadastro" on public.professores
  for select to authenticated using (id = public.professor_do_usuario());
