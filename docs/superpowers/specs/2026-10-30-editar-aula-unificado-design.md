# Editar aula unificado (com modalidade)

Pedido do tio, 30/10/2026: na tela da aula existem hoje dois caminhos que fazem
coisas parecidas — "Remarcar esta aula" (modal, só dia/horário) e "Mudar esta
aula" (vai para `/turmas/[id]/mudar`, pergunta "o que mudar" e "quais aulas",
com prévia). O pedido é um só botão "Editar aula": primeiro pergunta o escopo
(só esta / a partir de uma data / série inteira) e, assim que responde, abre
direto a tela com todos os campos editáveis juntos (dia/horário, professor,
serviço e, novo, modalidade), sem escolher campo por campo. As consequências já
implementadas (reposição, cobrança, Google, etc.) continuam como estão.

## Como é hoje

- `ConteudoDaAula.tsx` mostra dois controles quando `status === 'Agendada'` e
  sem presença: o botão `RemarcarAula` (modal client-side, só dia/horário, usa
  `remarcarAula`/`remarcacao.ts`) e, sempre (exceto `Excluída`), o link "Mudar
  esta aula" para `/turmas/[id]/mudar?aula=...&escopo=esta&acao=quando|professor`.
- `/turmas/[id]/mudar` (`page.tsx`) pede **o que mudar** (`quando`, `professor`,
  `servico`, `excluir`, `encerrar`) e **quais aulas** (`esta`, `a-partir`,
  `serie`), monta a prévia (`varrer`) e, quando a ação é `editar` com escopo
  `esta`, já mostra dia/horário e professor juntos num formulário só
  (`EditarEstaAula` em `PreviaDaMudanca.tsx`), aplicando por `editarEstaAula` →
  `dados/edicao-aula.ts`. Escopo `a-partir`/`serie` com `quando`/`professor`/
  `servico` vai para `AplicarNaSerie` → `mudarSerieDaTurma`.
- Modalidade mora só em `turmas.modalidade` (`'Presencial' | 'Online'`); a aula
  lê a modalidade da turma (`aulas.ts` seleciona `turma.modalidade`). Não há
  conceito de modalidade por aula.
- `professor_id` e `servico_id` já moram na aula desde a Etapa 2 ("turmas como
  agenda", 29/10/2026): a aula herda da turma na criação (gatilho
  `aula_herda_da_turma`) e a troca na turma propaga só para aulas Agendadas de
  hoje em diante sem chamada (gatilho `turma_propaga_para_aulas`).
- Aula `Realizada`: só libera corrigir professor (decisão 7/8, Rodada 3) — dia,
  horário e (hoje) modalidade não fazem sentido mudar depois do fato.
- G3: turma Online sem link ganha sala do Meet (coorganizador = professor,
  acesso confiável, moderação ligada), guardada em `turmas.google_meet_sala`.
  `aulas.link_online` já existe por aula.

## O que muda

### 1. Entrada na tela da aula

`ConteudoDaAula.tsx`: remove o botão `RemarcarAula` e o link "Mudar esta aula",
substitui por um botão único **"Editar aula"**, que leva para
`/turmas/[id]/mudar?aula=[id]` (sem `escopo`/`acao` na URL — a página decide).
`RemarcarAula.tsx` e a action `remarcarAula` deixam de ser chamados daqui (a
lógica de mover a aula, `remarcarAulaNoBanco`, continua em uso via
`editarAula`).

### 2. Página `/turmas/[id]/mudar`

Vira só o fluxo de **editar**. Exclusão e encerramento continuam existindo,
mas não entram neste botão único — ficam como estão hoje (acessados por outros
caminhos: `ExcluirAula` na tela da aula, "Encerrar a turma" na tela da turma).

O formulário no topo perde o seletor "O que mudar" e fica só com:
- **Quais aulas**: Só esta aula / A partir de uma data / A série inteira.
- **A partir de**: campo de data, só visível quando o escopo não é "esta".

A ação passada para `varrer`/`PreviaDaMudanca` é sempre
`{ tipo: 'editar', quando: true, professor: true, servico: true, modalidade: true }`.

### 3. Modalidade por aula

Nova coluna `aulas.modalidade` (`'Presencial' | 'Online'`, not null), seguindo
o padrão exato de `professor_id`/`servico_id` da Etapa 2:
- Migração preenche `aulas.modalidade` com `turmas.modalidade` atual.
- `aula_herda_da_turma`: passa a herdar também `modalidade`, se nula no insert.
- `turma_propaga_para_aulas`: passa a propagar `modalidade` também, com a mesma
  condição (só aulas Agendadas de hoje em diante, sem chamada).
- Editar **série** (a-partir/serie) atualiza `turmas.modalidade`, igual já faz
  com professor/serviço (`mudarSerieDaTurma`/`MudancaDaSerie`).
- Editar **só esta aula** atualiza só `aulas.modalidade` (`editarAula`).

Sala do Meet quando uma aula isolada vira Online: se `turmas.google_meet_sala`
já existir, a aula usa o mesmo link (lido via turma, como hoje); se a turma
nunca teve sala, cria uma sala nova reaproveitando a lógica de `meet.ts`/G3,
associada à aula via `aulas.link_online`. Se a aula isolada vira Presencial e a
turma é Online, nada muda na sala da turma (ela continua existindo para as
outras aulas).

### 4. Formulário unificado

`EditarEstaAula` e `AplicarNaSerie` (`PreviaDaMudanca.tsx`) passam a mostrar
sempre os 4 campos juntos — dia/horário, professor, serviço, modalidade — em
vez de condicionais por flag da ação (que agora vêm todas `true`), com uma
exceção:

- **Aula `Realizada`, escopo "só esta"**: dia/horário e modalidade ficam
  ocultos; só professor e serviço aparecem, com a mesma explicação que já
  existe hoje para esse caso.
- Nos demais casos (Agendada, ou qualquer escopo de série), todos os 4 campos
  aparecem.
- "Aplicar" só libera quando algum campo mudou de valor (como já é hoje).

### 5. Pontos de código que ganham `modalidade`

- `dados/edicao-aula.ts`: `EdicaoDaAula.modalidade: 'Presencial' | 'Online' | null`;
  `editarAula` grava `aulas.modalidade` quando mudou, cuidando da sala do Meet
  (item 3) e seguindo o mesmo padrão de erro que já existe para professor.
- `dominio/turmas/divisao.ts`: `MudancaDaSerie.modalidade?: 'Presencial' | 'Online'`.
- `dominio/agenda/varredura.ts`: `Acao` (variante `editar`) ganha `modalidade?: boolean`;
  `errosDaEdicao` bloqueia `quando`/`modalidade` (não `professor`/`servico`) em
  aula `Realizada`.
- `dados/varredura.ts`/`turmas/[id]/mudar/page.tsx`: monta `DadosDaEdicao` e
  `DadosDaSerie` com a modalidade atual da aula/turma e a opção de troca.

## Fora do escopo

- Excluir e encerrar continuam com seus próprios caminhos de entrada, não
  entram no botão "Editar aula".
- Mudar nº de aulas/semana (já estava fora da Etapa 6d).
- Marcar "avisou que não vem" na data específica do Google Agenda (adiado).
