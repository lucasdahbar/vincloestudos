# Mesinha Redonda OS — Documento de Design

**Data:** 13/08/2026
**Base:** `requisitos/Ajustes_Modulo_Cadastros.docx` (Adendo v1.1) e `requisitos/Requisitos_Modulos_Operacionais.docx` (v1.0)
**Status:** aprovado para implementação

---

## 1. Objetivo

Sistema web de gestão para o negócio de reforço escolar e aulas particulares Mesinha Redonda. Cobre o Módulo de Cadastros (com a entidade Turma introduzida pelo Adendo v1.1) e os seis módulos operacionais: Matrículas, Aulas e Integração com Google Calendar, Presenças e Reposições, Cobranças, Recebimentos e Pagamentos a Professores.

A usuária principal é a gestora, professora, sem familiaridade profunda com tecnologia. **Clareza e baixo risco de erro têm precedência sobre densidade de informação** em toda decisão de interface.

## 2. Lacuna conhecida: Módulo de Cadastros v1.0

O documento base *"Documento de Requisitos — Módulo de Cadastros v1.0"* não foi fornecido. Os dois documentos disponíveis o referenciam extensivamente, o que permitiu recuperar parte de sua especificação por referência cruzada. O restante foi inferido a partir das necessidades do negócio.

A Seção 4 marca cada campo como **[DOC]** (derivado explicitamente dos documentos) ou **[INFERIDO]** (decisão deste design). Todo campo `[INFERIDO]` é opcional no banco salvo indicação contrária, para que a validação posterior com a gestora não exija migração destrutiva.

### Recuperado por referência cruzada

| Origem | Fato recuperado |
|---|---|
| Adendo §3 (5.1) | `servicos.permite_materia`, `servicos.permite_escola` (doc original §3.7) |
| Adendo §5 | Ano escolar do aluno é definido pela Turma, não pelo cadastro do aluno |
| Adendo §10 | `alunos.destinatario_notificacao`, `alunos.canal_notificacao` (campos novos) |
| Adendo §9 | Entidades com origem em migração: Responsáveis, Alunos, Escolas, Professores, Cidades |
| Operacionais §1 | Entidades de cadastro: Responsáveis, Alunos, Escolas, Professores, Serviços, Matérias, Anos Escolares, Contas, Turmas |
| Operacionais §8.2 | `servicos.valor_padrao`, `professores.percentual_repasse` com vigência histórica (doc original §4.2) |
| Operacionais §7.1 | `contas` é entidade do Módulo de Cadastros, referenciada por recebimentos e pagamentos |
| Operacionais §6.4 | Existe uma chave Pix exibida no texto de cobrança |

## 3. Stack e arquitetura

### 3.1 Tecnologia

| Camada | Escolha | Razão |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Server Actions cobrem bem o CRUD; rotas públicas para o formulário de presença |
| Banco | Supabase Postgres | Constraints reais, `numeric` para dinheiro, RLS, auth pronta |
| Migrations | `supabase/migrations/*.sql` versionadas | Aplicáveis em local (Docker) ou remoto; nenhum projeto pago necessário agora |
| Estilo | Tailwind CSS v4 + tokens próprios | Design system consistente sem peso de biblioteca de componentes |
| Animação | Motion (`motion/react`) | Transições declarativas e leves |
| Formulários | React Hook Form + Zod | Mesmo schema Zod valida no cliente e no servidor |
| Testes | Vitest | Domínio puro é rápido de testar |

### 3.2 Camadas

```
src/dominio/     Regras de negócio puras. Sem I/O, sem Supabase, sem React.
src/dados/       Repositórios. Um por agregado. Única camada que fala com o banco.
src/app/         Rotas, telas e Server Actions. Finas: validam entrada, chamam domínio, persistem.
src/ui/          Componentes do design system.
```

A dependência flui em uma direção só: `app → dados → dominio`. O domínio não importa nada das outras camadas. Isso é o que torna as regras financeiras testáveis sem banco.

**Módulos de domínio:**

| Módulo | Responsabilidade |
|---|---|
| `dominio/turmas/nome.ts` | Geração do nome da turma por concatenação |
| `dominio/agenda/materializacao.ts` | Ocorrências de recorrência → aulas previstas |
| `dominio/agenda/feriados.ts` | Detecção de conflito aula × feriado |
| `dominio/presencas/registro.ts` | Presenças em lote + geração de pendências |
| `dominio/reposicoes/agendamento.ts` | Regras de agendamento e desistência |
| `dominio/cobrancas/geracao.ts` | Seleção da base de cálculo e montagem dos itens |
| `dominio/cobrancas/texto.ts` | Texto formatado para WhatsApp |
| `dominio/recebimentos/quitacao.ts` | Saldo e transição de status da cobrança |
| `dominio/pagamentos/fechamento.ts` | Cálculo de repasse por presença confirmada |
| `dominio/dinheiro.ts` | Aritmética monetária em centavos inteiros |

### 3.3 Precisão monetária (RNF)

Armazenamento em `numeric(12,2)`. Em TypeScript, todo valor monetário trafega como **inteiro de centavos** (`type Centavos = number`), convertido na fronteira do repositório. Nenhuma operação aritmética com `float`. Somatórios de conferência são recalculados em SQL com `numeric`.

## 4. Modelo de dados

Convenções: todas as tabelas têm `id bigint generated always as identity`, `created_at` e `updated_at timestamptz` (trigger de atualização). Nomes em português, snake_case, conforme os documentos.

### 4.1 Cadastros

**`cidades`** — `nome`[INFERIDO, obrig.], `uf` char(2)[INFERIDO]

**`escolas`** — `nome`[DOC, obrig.], `cidade_id`[INFERIDO], `endereco`[INFERIDO], `telefone`[INFERIDO], `ativo`[INFERIDO, padrão true]

**`anos_escolares`** — `nome`[DOC, obrig.] (ex.: "9º ano — Fundamental"), `ordem` int[INFERIDO] para ordenação natural, `ativo`[INFERIDO]

**`materias`** — `nome`[DOC, obrig.], `ativo`[INFERIDO]

**`servicos`** — `nome`[DOC, obrig.], `valor_padrao numeric(12,2)`[DOC, obrig.], `permite_materia bool`[DOC, obrig.], `permite_escola bool`[DOC, obrig.], `descricao`[INFERIDO], `ativo`[INFERIDO]

**`professores`** — `nome`[DOC, obrig.], `percentual_repasse numeric(5,2)`[DOC, obrig.], `telefone`[INFERIDO], `email`[INFERIDO], `cpf`[INFERIDO], `chave_pix`[INFERIDO], `ativo`[DOC — §5.1 exige professor ativo], `usuario_id uuid → auth.users`[INFERIDO, nulável]

**`professor_percentual_historico`** — `professor_id`, `percentual numeric(5,2)`, `vigencia_inicio date`, `vigencia_fim date` nulável. Existe porque a RN 8.2 exige o percentual *vigente na data da aula*. Alterar `professores.percentual_repasse` fecha a vigência anterior e abre uma nova por trigger.

**`servico_valor_historico`** [INFERIDO] — `servico_id`, `valor numeric(12,2)`, `vigencia_inicio date`, `vigencia_fim date` nulável. Pelo mesmo motivo: §6.2 define `valor_original` como "valor padrão do serviço **na data da aula**" e §8.2 usa o valor do serviço no cálculo do repasse. Sem histórico, reajustar um serviço reescreveria o passado. Mesma mecânica de trigger.

**`contas`** — `nome`[DOC, obrig.], `tipo`[INFERIDO] (Banco/Dinheiro/Carteira digital), `banco`[INFERIDO], `chave_pix`[INFERIDO], `ativo`[INFERIDO]

**`responsaveis`** — `nome`[DOC, obrig.], `telefone`[INFERIDO] (usado no envio WhatsApp), `email`[INFERIDO], `cpf`[INFERIDO], `endereco`[INFERIDO], `cidade_id`[INFERIDO], `observacao`[INFERIDO], `ativo`[INFERIDO]

**`alunos`** — `nome`[DOC, obrig.], `responsavel_id`[DOC, obrig. — "sempre vinculado a um Responsável"], `escola_id`[INFERIDO], `data_nascimento`[INFERIDO], `telefone`[INFERIDO], `email`[INFERIDO], `observacao`[INFERIDO], `ativo`[DOC — §3.1 exige aluno ativo], `destinatario_notificacao` enum(Aluno/Responsável/Ambos)[DOC, padrão Responsável], `canal_notificacao` enum(WhatsApp/E-mail/Ambos)[DOC, padrão WhatsApp].
**Não tem** campo de ano escolar — definido pela Turma (Adendo §5).

**`turmas`** [DOC integral, Adendo §3] — `nome` (gerado), `servico_id`, `materia_id` (condicional a `permite_materia`), `escola_id` (condicional a `permite_escola`), `ano_escolar_id`, `professor_id`, `modalidade` enum(Presencial/Online), `dias_semana` int[] (0–6), `horario_inicio time`, `horario_fim time`, `google_calendar_event_id` único nulável, `status` enum(Ativa/Encerrada).
Constraints: `horario_fim > horario_inicio`; `array_length(dias_semana) >= 1` quando status = Ativa; condicionalidade de matéria/escola validada por `CHECK` com função que lê o serviço.
`nome` **não** é único (RN 5.2).

**`feriados`** — `data`[DOC §4.3], `nome`, `abrangencia` enum(Nacional/Estadual/Municipal). Configurável pela gestora.

### 4.2 Operacionais

Todas conforme especificação literal dos documentos.

**`matriculas`** — `aluno_id`, `turma_id`, `data_inicio` (padrão hoje), `data_fim` nulável, `flag_reposicao bool` padrão false, `status` enum(Ativa/Encerrada). `CHECK data_fim > data_inicio`.

**`aulas`** — `turma_id`, `google_calendar_event_id` **UNIQUE**, `data_hora_inicio`, `data_hora_fim`, `status` enum(Agendada/Realizada/Cancelada/Feriado), `link_online` (obrigatório se turma Online), `observacao`.

**`presencas`** — `aula_id`, `aluno_id`, `presente bool`, `flag_reposicao bool`, `registrado_por` → professores, `registrado_em`, `observacao`. **UNIQUE(aula_id, aluno_id)**.

**`pendencias_reposicao`** — `aluno_id`, `aula_origem_id`, `status` enum(Pendente/Agendada/Realizada/Desistida), `aula_reposicao_id` nulável, `matricula_reposicao_id` nulável.

**`cobrancas`** — `responsavel_id`, `mes_referencia date` (dia 1), `data_geracao`, `valor_bruto`, `valor_desconto`, `valor_total`, `status` enum(Rascunho/Confirmada/Enviada/Quitada/Parcial), `texto_whatsapp`. **UNIQUE(responsavel_id, mes_referencia)**.

**`itens_cobranca`** — `cobranca_id`, `aluno_id`, `aula_id` **UNIQUE**, `descricao`, `valor_original`, `desconto` padrão 0, `valor_final`. A unicidade de `aula_id` é a garantia estrutural da idempotência exigida pelo RNF.

**`recebimentos`** — `cobranca_id`, `valor_recebido` (> 0), `data_recebimento` (padrão hoje), `conta_id`, `forma_pagamento` enum(Pix/Dinheiro/Transferência/Cartão/Outros), `observacao`, `registrado_por`.

**`contas_pagar_professor`** — `professor_id`, `periodo_inicio`, `periodo_fim`, `valor_total`, `status` enum(Pendente/Pago), `data_pagamento`, `conta_id`.

**`itens_conta_pagar_professor`** [INFERIDO] — `conta_pagar_id`, `presenca_id`, `aluno_id`, `turma_id`, `data_aula`, `valor_servico`, `percentual_aplicado`, `valor_professor`. Existe para materializar o relatório de fechamento da §8.3 e preservar o histórico mesmo que o percentual mude depois.

### 4.3 Apoio

**`presenca_tokens`** [INFERIDO, exigido por §5.5] — `token` (aleatório, único), `aula_id`, `professor_id`, `expira_em`, `usado_em` nulável, `reaberto_em` nulável. O link fica bloqueado após confirmação; a gestora pode reabrir.

**`notificacoes`** [INFERIDO, exigido por §4.5 e §6.5] — `tipo` enum(LinkAula/BoasVindas/Cobranca), `canal` enum(WhatsApp/Email), `destinatario_tipo`, `destinatario_id`, `agendado_para`, `texto_gerado`, `status` enum(Pendente/Pronta/Enviada/Falhou), `enviado_em`, `referencia_tipo`, `referencia_id`. É a fila que permite trocar envio manual por API sem alterar o modelo.

**`logs_operacionais`** [INFERIDO, exigido pelo RNF de Logs] — `acao`, `entidade`, `entidade_id`, `usuario`, `detalhe jsonb`, `criado_em`.

### 4.4 Segurança de acesso

Tabela `perfis` (`usuario_id uuid PK → auth.users`, `papel` enum(gestora/professor), `professor_id` nulável).

RLS em todas as tabelas:
- **gestora**: leitura e escrita em tudo.
- **professor**: leitura de suas turmas, aulas e alunos matriculados nelas. Sem acesso a nada financeiro.
- **anônimo**: nenhum acesso direto. O formulário público de presença passa por Server Action que valida o token e usa a service role key — a chave nunca chega ao cliente.

## 5. Regras de negócio críticas

Estas são as que carregam risco financeiro e recebem teste automatizado antes da implementação.

### 5.1 Geração de cobrança (§6.3)

1. Entrada: mês de referência.
2. Base de cálculo: aulas com status `Agendada` dentro do mês, de turmas com matrícula **ativa** e **`flag_reposicao = false`**.
3. Exclui aulas já presentes em qualquer `itens_cobranca` (via UNIQUE + verificação prévia).
4. Agrupa por responsável do aluno; uma cobrança por responsável por mês.
5. `valor_original` = `servicos.valor_padrao` **vigente na data da aula**.
6. Resultado em `Rascunho`; a gestora ajusta descontos por item; confirmar gera `texto_whatsapp` e move para `Confirmada`.
7. Reprocessar o mesmo mês não duplica item algum — é a propriedade testada explicitamente.

### 5.2 Presença e reposição (§5.2, §5.4)

1. Salvar o formulário cria uma `presenca` por aluno matriculado na turma naquela aula, em transação única.
2. A aula passa a `Realizada`.
3. Cada `presente = false` gera uma `pendencia_reposicao`, **exceto** se aquela presença tem `flag_reposicao = true`.
4. Agendar reposição em turma diferente cria uma `matricula` com `flag_reposicao = true` — que nunca entra em cobrança.
5. A presença confirmada na reposição conta normalmente para o pagamento do professor que a ministrou.
6. A gestora é notificada a cada ausência registrada.

### 5.3 Fechamento de professor (§8.2)

`valor_professor = servicos.valor_padrao (vigente na data da aula) × percentual_repasse (vigente na data da aula)`, somado sobre todas as presenças com `presente = true` no período. Ausências e aulas sem registro valem zero. Presenças de reposição entram normalmente.

### 5.4 Quitação (§7.2)

`saldo = valor_total − Σ recebimentos`. Saldo ≤ 0 → `Quitada`. `0 < Σ < valor_total` → `Parcial`.

## 6. Integração com Google Calendar

Interface única, duas implementações:

```ts
interface ProvedorAgenda {
  listarOcorrencias(turma: Turma, de: Date, ate: Date): Promise<OcorrenciaAula[]>
}
```

- **`RecorrenciaLocal`** — deriva ocorrências de `dias_semana` + horários da turma. Funciona sem credencial nenhuma e é o provedor ativo na entrega.
- **`GoogleCalendar`** — OAuth 2.0 sobre a agenda compartilhada, lê o evento recorrente de `turma.google_calendar_event_id`. Implementado e desligado por variável de ambiente até você ter as credenciais.

A sincronização é **idempotente por `google_calendar_event_id`**: faz upsert, atualiza horário e status de ocorrências movidas ou canceladas, e nunca apaga aula com presença registrada. Trocar de provedor não duplica dados. Falha de API não descarta o que já foi lido (RNF).

Conflito com feriado gera **alerta visual** para a gestora decidir — o sistema nunca cancela sozinho (RN 4.2).

## 7. Interface

### 7.1 Princípios

Para uma usuária sem familiaridade com tecnologia, quatro decisões carregam a maior parte do resultado:

1. **Fluxos de dinheiro são assistentes passo a passo** com tela de resumo antes de confirmar. Gerar cobranças, dar baixa e fechar professor nunca são um botão solto.
2. **Estados vazios explicam o próximo passo** em vez de mostrar tabela vazia.
3. **Confirmação em português claro** para ações destrutivas: "Encerrar esta turma? Os alunos param de gerar cobrança, mas o histórico de aulas continua salvo."
4. **Alvos grandes e foco visível.** Mínimo 44px, contraste WCAG AA.

### 7.2 Linguagem visual

| Token | Valor |
|---|---|
| `--fundo` | `#FBF8F3` creme |
| `--tinta` | `#2B2724` |
| `--destaque` | `#C0603F` terracota |
| `--apoio` | `#5C7A63` verde-sálvia |
| Raio | 12px padrão, 20px em cartões |
| Tipografia | Serifada de exibição em títulos, sans em texto e dados |

Animações servem à compreensão, nunca à decoração: stagger em listas, transição entre etapas dos assistentes, contagem progressiva em totais, toast de confirmação. Respeitam `prefers-reduced-motion`.

### 7.3 Rotas

```
/login
/                            Painel: aulas de hoje, ausências a repor, cobranças em aberto
/cadastros/{responsaveis|alunos|escolas|professores|servicos|materias|anos-escolares|contas|cidades|feriados}
/turmas · /turmas/[id]       Alunos matriculados, próximas aulas
/matriculas
/agenda                      Calendário semana/mês, filtro por turma e professor
/agenda/aulas/[id]           Detalhe, presenças, link
/reposicoes                  Painel de pendências
/cobrancas · /cobrancas/[id] Geração mensal e detalhe com texto do WhatsApp
/recebimentos                Cobranças em aberto e registro de baixa
/pagamentos                  Fechamento e contas a pagar
/relatorios
/p/presenca/[token]          PÚBLICO, sem login
```

Navegação cruzada conforme Adendo §7 e Operacionais §9: cada entidade linka para as relacionadas.

## 8. Testes

Vitest sobre o domínio puro, escrito **antes** da implementação de cada regra:

- Idempotência da geração de cobrança (reprocessar não duplica).
- Exclusão de matrículas de reposição da base de cálculo.
- Agrupamento por responsável com múltiplos filhos e turmas.
- Texto do WhatsApp reproduzindo o formato do exemplo da §6.4.
- Cálculo de repasse com percentual histórico.
- Geração e supressão de pendência de reposição.
- Transições de status por quitação total e parcial.
- Aritmética monetária sem erro de arredondamento.

Testes de integração cobrem o fluxo do formulário público de presença e a sincronização de agenda.

## 9. Fases de entrega

| # | Fase | Entrega |
|---|---|---|
| 1 | Fundação | Next.js, design system, Supabase local, auth, layout e navegação |
| 2 | Cadastros | Todas as entidades base com CRUD e navegação cruzada |
| 3 | Turmas e Matrículas | Nome gerado, campos condicionais, regras de vínculo |
| 4 | Agenda | Provedor de recorrência, materialização de aulas, feriados |
| 5 | Presenças e Reposições | Formulário público por token, pendências, agendamento |
| 6 | Cobranças | Geração mensal idempotente, ajuste de itens, texto do WhatsApp |
| 7 | Recebimentos | Baixa manual, parcial, saldo em aberto |
| 8 | Pagamentos | Fechamento por período, relatório detalhado, baixa |
| 9 | Acabamento | Painel, notificações, seed, animações, responsividade |

## 10. Fora de escopo

Portal do responsável (Fase 2 no documento), envio automático por API de WhatsApp, migração dos dados existentes das planilhas, e o OAuth do Google Calendar ligado em produção (implementado, aguardando credenciais).
