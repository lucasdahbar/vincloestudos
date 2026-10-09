@AGENTS.md

# Vinclo Estudos

Sistema de gestão de uma escola de reforço escolar no Rio de Janeiro: cadastros,
turmas, matrículas, agenda, presença, reposições, cobranças, recebimentos,
pagamento de professores e créditos. Antigo nome do projeto: "Mesinha Redonda"
(aparece em docs antigos e numa conta de teste). A marca fica num lugar só:
`src/marca.ts`.

**Em uso real desde 01/10/2026.** O banco tem dados da escola: turmas, alunos,
cobranças, 221 responsáveis importados. A gestora ainda controla em paralelo pela
planilha dela, mas trate tudo como produção.

## Pessoas e fluxo de trabalho

- **Lucas** (usuário): o desenvolvedor. Fala em português.
- **Julio Dahbar** (tio do Lucas): o dono, que escreve as regras de negócio. Manda
  mensagens e áudios no WhatsApp, e o Lucas cola aqui (áudio vem transcrito).
- **Kelly Dahbar**: a gestora, que usa o sistema no dia a dia. Também é
  professora (cadastro de professor id 9).

Quando o Lucas colar uma mensagem do tio, o padrão é:

1. **Ler o código antes de opinar.** Comparar a regra com o que o sistema faz
   hoje (tabela "como é hoje × o que muda") e apontar lacunas, implicações e
   integrações esquecidas. O tio pede crítica explicitamente.
2. **Perguntar o que for decisão de negócio**, sem inventar. Quando o Lucas disser
   "decide você", decidir, deixar a decisão anotada e avisar.
3. **Sempre terminar com uma mensagem pronta para o WhatsApp**, informal, em
   português, começando com "Fala tio" ou parecido, que o Lucas encaminha sem editar.
4. Regra grande: avisar antes que é grande, e implementar por partes, com commit
   por etapa.

As regras do tio vêm em árvore (Se... Se não... Fim). Os documentos originais de
requisitos estão em `requisitos/` (.docx e .pdf; não há leitor de PDF instalado).

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions). Tem mudanças em relação
  ao que você conhece: leia `node_modules/next/dist/docs/` antes de usar uma API.
  O middleware chama `proxy.ts`. `next lint` não existe: use `npm run lint`.
- **Supabase** (Postgres, RLS, Auth). Papéis: `gestora` e `professor` (tabela
  `perfis`). O RLS protege os dados: o cliente do navegador usa a chave anon, e a
  service_role só é usada no servidor.
- **Vercel**: produção em https://vinclo-estudos.vercel.app, com deploy
  automático no push para `main`. As variáveis de produção são do tipo "Secret" e
  não dá para ler o valor pela CLI.
- **Google Workspace** da escola (`vincloestudos.com.br`, plano **Business Standard**).
- Vitest para os testes. Tailwind v4 com tokens próprios (`bg-superficie`,
  `text-tinta-suave`, `text-destaque`, `bg-alerta-suave`...).

## Arquitetura

```
src/dominio/   regras puras, sem banco, com *.test.ts ao lado. É onde mora a regra de negócio.
src/dados/     camada de dados, 'server-only'. clienteServidor() (sessão) e clienteAdmin() (service_role)
src/app/(app)/ telas logadas; cada pasta tem acoes.ts ('use server', começa com exigirGestora())
src/app/p/     links públicos do professor (permanente /p/professor/[token] e por aula /p/presenca/[token])
src/agenda/    Google Agenda e Meet (credenciais, eventos, salas)
src/cadastros/ motor genérico de CRUD: a definição dos campos fica em cadastros/definicoes/
src/ui/        componentes (Botao, Cartao, Selo, Campo...) e navegacao.ts (menu)
```

Convenções:
- Regra nova vai para `dominio/`, com teste, e a camada de dados só a aplica.
  Escreva o teste antes e veja-o falhar.
- Funções de dados e integrações devolvem `{ ok, erros }` / `{ ok, motivo }` em
  vez de estourar. Falha do Google nunca derruba o salvamento de uma turma.
- Dinheiro em **centavos** (`Centavos`, `dominio/dinheiro.ts`: `deReal`,
  `deNumeric`, `paraNumeric`, `formatarBRL`). O banco usa numeric(12,2).
- CPF, telefone e CEP são gravados **com máscara** (`dominio/documentos/formato.ts`).
- Comentários explicam o **porquê**, citando o item do requisito (G2, R3, C7,
  "Rodada 3"...). Siga a densidade de comentários que já existe.
- Nomes de identificadores e textos em português. Nos comentários dos `.ts`, o
  código antigo costuma omitir acentos; a interface sempre tem acentos.
- Commits em português, sem acento no título (`feat(escopo): ...`), com corpo
  explicando o porquê. **Sem linha de coautoria do Claude.**

## Banco e migrações

- `supabase/migrations/`, aplicadas no projeto remoto já ligado:
  `export SUPABASE_ACCESS_TOKEN=$(grep -E "^SUPABASE_ACCESS_TOKEN=" .env.local | cut -d= -f2-) && npx supabase db push --linked --yes`
  O aviso sobre docker no fim pode ser ignorado.
- **Valor novo de enum vai numa migração separada**: o Postgres não deixa usar
  um valor de enum na mesma transação em que ele foi criado.
- Tabela nova: RLS ligado e policy `"gestora total"` (veja as migrações recentes).
- Consultar o banco: `node scripts/consultar.mjs <tabela> ["col1,col2"] [--count]`.

## Verificação (antes de dizer que está pronto)

```
npx tsc --noEmit        # tem de sair vazio
npx vitest run          # ~417 testes
npm run lint            # 5 problemas já existiam (semear.mjs, NavMobile, cobrancas/page, Formulario, tipos); não pode aparecer nenhum novo
npx next build          # pega erro de fronteira servidor/cliente que o tsc não pega
```

**Teste de integração contra o banco real**, quando a mudança mexe na camada de
dados: crie um `src/dados/<nome>.integracao.test.ts` temporário com
`vi.mock('server-only', () => ({}))` e `vi.mock('@/dados/cliente', () => ({ clienteServidor: async () => admin }))`.
Monte o cenário num **mês sem aula real** (março de 2031 foi usado) com nomes
`ZZ ...`, apague tudo no `afterAll`, confira que não ficou resíduo e **apague o
arquivo**. Ele não pode entrar na suíte, porque roda contra produção.

O Claude não consegue clicar nas telas: avise o Lucas quando o teste visual
depender dele.

## Cuidados com dados reais

- `scripts/limpar-dados-de-teste.mjs` apaga TODOS os dados de negócio, menos
  professores e catálogo, e tira os eventos do Google antes. **Só rode com pedido
  explícito**, e sempre com `--ensaio` primeiro.
- `scripts/semear.mjs --limpar` está desatualizado e apaga até os professores e
  suas agendas: não use.
- `gerarCobrancasDoMes` processa o mês inteiro, de todos os responsáveis.
- Planilhas da escola (CSV na raiz) ficam fora do git (`/*.csv`, `/*.CSV`) porque têm CPF.
- Importação de responsáveis: `node scripts/importar-responsaveis.mjs <csv> --ensaio | --confirmo`.
  O script lê CSV do Excel em Windows-1252 e não duplica ao rodar de novo.

## Integração Google (detalhes em docs/google-agenda.md)

- Autorizada pela conta **kellydahbar@vincloestudos.com.br** (tela /cadastros/integracoes).
  Escopos: `calendar`, `userinfo.email` e `meetings.space.created`. O refresh token
  fica na tabela `google_oauth`, sem policy.
- Cada professor tem `professores.google_calendar_id`, uma subagenda da conta da
  escola (14 vinculadas). O vínculo turma → professor → agenda é **por ID, nunca
  por nome**.
- `GOOGLE_CALENDAR_ATIVO=true` liga **só a escrita** no Google (evento da turma).
  As aulas do sistema saem sempre da recorrência da própria turma
  (`agenda/recorrencia-local.ts`). Já houve um bug grave por causa da flag fazer
  as duas coisas.
- G3: turma **online** sem link ganha uma sala do Meet com acesso Confiável,
  moderação ligada e o professor (Gmail pessoal) como **coorganizador**.
  A sala fica em `turmas.google_meet_sala`.
- Os alunos nunca aparecem no evento do Google: a lista de alunos vive no sistema.
- A conta `lucasdahbar@vincloestudos.com.br` ainda existe; o tio pode removê-la
  para economizar licença. Antes, confirme no IAM do Google Cloud que outra conta
  é Proprietária do projeto.

## Regras de negócio decididas recentemente (Rodada 3, 09/10/2026)

Reposição e ausência (`dominio/reposicoes/desfecho.ts`, `dados/reposicoes.ts`):
- Ausência avisada ou falta marcada pelo professor viram uma `pendencias_reposicao`
  (`origem` Aviso/Falta). "Não gerar reposição" = pendência criada já `Desistida`.
- Na desistência (ou "sem reposição"), a gestora decide `cobrar` e, cobrando,
  `pagar_professor` ("desistência paga", paga ao professor da turma original,
  com o mesmo cálculo de uma aula dada).
- Não cobrar uma aula ainda não cobrada: ela sai da próxima cobrança. Já cobrada
  (recebida ou não): vira **crédito** do responsável.
- Quem avisou continua na lista da aula, marcado e sem presença/falta (`dados/lista-da-aula.ts`,
  a ÚNICA montagem da lista; não duplique).
- A reposição em outra turma cria uma matrícula **só na data** da aula de destino.
  A presença nela marca a pendência como `Realizada`.
- Cobrança da reposição: R$ 0,00 se a turma de destino tiver o mesmo valor ou
  for mais barata; só a diferença se for mais cara.
- A reposição não tem prazo. O aviso pode ser cancelado enquanto não houver
  reposição marcada, crédito ou pagamento ao professor.
- Crédito (`dominio/creditos`, tela /creditos): sem validade, usado em partes,
  abatido de uma cobrança em aberto (vira recebimento com forma "Crédito", sem
  conta) ou devolvido. Aluno que sai com crédito recebe o valor de volta.
- Turmas recorrentes só têm aula a partir do dia do cadastro (fuso de São Paulo).
  A aula única não segue essa regra.

## Pendências conhecidas

- O tio vai mandar as regras de **criação/edição/exclusão de turmas** e de
  **integração com o financeiro**. Elas cruzam com crédito e cobrança, então leia
  a Rodada 3 antes de mexer.
- Marcar "avisou que não vem" na data específica do Google Agenda: adiado de comum acordo.
- Stephany Chaiben (inativa) sem agenda. Agenda duplicada da Stephanie: o tio ia apagar.
- Professores novos sem telefone/CPF/Pix: a escola completa pela tela.

## Ambiente (Windows)

- O shell padrão é o PowerShell; também há Git Bash. Em heredoc do Bash, código
  Python com `"""` encostado em `"` quebra: escreva o script com a ferramenta
  Write no scratchpad e rode com `python /c/Users/...`.
- O `.next` fica num disco lento (D:). Se o `npm run dev` começar a dar 404 em
  rotas que existem, reinicie com `rm -rf .next`.
- `.env.local` tem segredos: nunca imprima valores. Use máscara, por exemplo `sed -E 's/=(.{6}).*/=\1…/'`.
