# Turmas como agenda — Documento de Design

**Data:** 09/10/2026
**Escopo:** criação de turmas com recorrência e período (como um compromisso no Google Agenda), datas puladas por feriado e recesso, e exclusão de turma inteira ou de uma única aula.

## 1. Objetivo

Na prática, cadastrar turmas só como "toda semana, sem fim" ou "não se repete" não basta. O gestor precisa:

- escolher a frequência (diária, semanal, quinzenal, mensal ou personalizada);
- definir data de início (anterior ou posterior ao cadastro) e, se quiser, data de fim;
- ter as aulas recorrentes lançadas só em dias que não são feriado nem recesso;
- excluir uma aula específica, ou a turma inteira quando ela não tem histórico.

**Não muda:** criação automática da sala do Meet só para turma online, evento na agenda Google do professor (convidado), lista de alunos na descrição de cada ocorrência, horário de início e fim únicos por turma, e as regras de reposição e cobrança.

## 2. Abordagem

As aulas continuam derivadas de forma pura e determinística de uma **regra de recorrência** da turma (`dominio/agenda/materializacao.ts`), materializadas sob demanda e gravadas por upsert idempotente em `aulas.google_calendar_event_id`. No Google, a turma continua sendo **um único evento recorrente**, agora com `RRULE` completa (FREQ, INTERVAL, BYDAY/BYMONTHDAY, UNTIL) e `EXDATE` para as datas puladas.

Descartadas: gerar todas as aulas no cadastro como eventos avulsos no Google (centenas de eventos por turma, edição vira reescrita em massa) e o híbrido (duas fontes de verdade).

## 3. Modelo de dados

### 3.1 Turma

`tipo_recorrencia` ('Único' | 'Recorrente') e `data_unica` continuam. Novas colunas, usadas só quando `Recorrente`:

| Coluna | Tipo | Regra |
|---|---|---|
| `frequencia` | enum `frequencia_turma` ('Diária', 'Semanal', 'Mensal') | obrigatória se Recorrente |
| `intervalo` | smallint, ≥ 1, default 1 | "a cada N" |
| `data_inicio` | date | obrigatória se Recorrente; pode ser passada ou futura |
| `data_fim` | date | sempre gravada se Recorrente; `>= data_inicio` |
| `fim_automatico` | boolean, default false | true quando o gestor não informou fim e o sistema usou 31/12 do ano corrente |

`dias_semana` continua: obrigatório (≥ 1 dia) quando `frequencia = 'Semanal'`; vazio para 'Diária' e 'Mensal'.

**Opções do formulário → regra gravada:**

| Opção | frequencia | intervalo | dias_semana |
|---|---|---|---|
| Diário | Semanal | 1 | seg a sex (1–5) |
| Semanal | Semanal | 1 | escolhidos |
| Quinzenal | Semanal | 2 | escolhidos |
| Mensal | Mensal | 1 | — (dia do mês = dia de `data_inicio`) |
| Personalizado | Diária / Semanal / Mensal | N | escolhidos, se Semanal |

- Diária com intervalo N conta dias corridos, inclusive fim de semana (só no Personalizado).
- Semanal com intervalo > 1 conta semanas a partir da semana de `data_inicio` (semana começando no domingo, como o `WKST` padrão do Google).
- Mensal repete no dia do mês de `data_inicio`; mês sem esse dia (ex.: 31) é pulado, como o Google faz.
- Ao editar, o formulário reconhece a opção a partir da regra gravada (ex.: Semanal/1/seg–sex é exibido como "Diário").

**Turmas existentes (migração):** `frequencia = 'Semanal'`, `intervalo = 1`, `data_inicio` = dia do cadastro em São Paulo (`dataDeCadastro(created_at)`), `data_fim = 2026-12-31`, `fim_automatico = true`. A regra `cadastrada_em` da materialização deixa de existir: `data_inicio` a substitui.

### 3.2 Aula

Novo valor em `status_aula`: **'Excluída'**. A aula excluída não é apagada:

- continua como `aula_origem_id` das reposições dos alunos transferidos (`pendencias_reposicao.aula_origem_id` é `on delete cascade`: apagar a aula apagaria as reposições);
- o upsert com `ignoreDuplicates` não a recria;
- some da agenda, do calendário, das listas de presença, dos alertas de conflito e de qualquer contagem que hoje considere 'Cancelada' como inexistente. Todo lugar que lista ou conta aulas precisa ser revisado para ignorar 'Excluída'.

Quando a aula excluída ainda não tinha sido materializada (data futura fora da janela já aberta), a exclusão insere a linha já com status 'Excluída'.

## 4. Geração das aulas

`materializar(turma, de, ate, puladas)`:

- **Único:** como hoje. A data única nunca é pulada, mesmo em feriado ou recesso.
- **Recorrente:** gera as datas da regra dentro de [`max(de, data_inicio)`, `min(ate, data_fim)`] e remove:
  - datas de **feriados** cadastrados (qualquer abrangência);
  - datas em **recessos da escola da turma** (turma sem escola nunca cai em recesso).
- Aulas 'Excluída' já existem como linha e não são sobrescritas pelo upsert.

Funções puras novas em `dominio/agenda/`: expansão da regra (`datasDaRegra`), cálculo das datas puladas (`datasPuladas(turma, feriados, recessos)`) e o resumo do formulário ("N aulas, M datas puladas").

### 4.1 Feriado ou recesso cadastrado depois

Ao cadastrar, alterar ou importar feriados/recessos:

1. Aulas `Agendada` de turmas **recorrentes**, a partir de hoje, nas datas afetadas, são **apagadas** se não tiverem presença, aluno na data (ver 6.2), reposição apontando para elas nem cobrança. Elas não voltam, porque a geração já pula a data.
2. As que têm algum desses vínculos ficam e aparecem no alerta de conflito existente (`conflitosComFeriado` / `conflitosComRecesso`).
3. Os eventos das turmas afetadas são ressincronizados no Google (importação em lote: uma ressincronização por turma, no final).

Feriado ou recesso removido: a aula volta na próxima materialização e a `EXDATE` sai do evento.

### 4.2 Edição da turma

Mudando frequência, intervalo, dias, horário ou período, as aulas futuras `Agendada` sem vínculo (mesmo critério de 4.1) que não pertencem mais à regra são apagadas. As que têm vínculo ficam e entram no alerta de conflito, para o gestor decidir.

### 4.3 Turma de aula única em feriado ou recesso

Ao salvar, se `data_unica` cai em feriado ou em recesso da escola da turma, o formulário mostra "15/11/2026 é feriado (Proclamação da República). Criar mesmo assim?". Confirmado, salva normalmente.

## 5. Google Agenda

`montarEvento` passa a produzir:

- `start`/`end` na **primeira ocorrência a partir de `data_inicio`** (não mais "hoje"). Se `data_inicio` for passada, as ocorrências passadas aparecem na agenda do professor: é o que o gestor pediu ao escolher uma data retroativa.
- `RRULE:FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=N;BYDAY=…` (Semanal) ou `BYMONTHDAY=d` (Mensal) `;UNTIL=<data_fim 23:59:59 em São Paulo, convertido para UTC>`.
- `EXDATE;TZID=America/Sao_Paulo:` com as datas da regra que **não têm aula ativa** no sistema: datas puladas por feriado/recesso sem aula mantida (4.1 item 2) e aulas 'Excluída'.
- A descrição muda o "toda semana" para o resumo da regra ("Terças e quintas, a cada 2 semanas, até 31/12/2026").

Ressincroniza quando: a turma é salva ou renovada, uma aula é excluída, um feriado/recesso que atinge a turma muda. Continua em `after()`, sem derrubar o salvamento se o Google falhar. `ajustarOcorrencias` (descrição por ocorrência) continua igual.

## 6. Exclusões

### 6.1 Turma inteira

Permitida só se a turma **nunca** teve: matrícula (qualquer status, inclusive de reposição), presença, pendência de reposição (como origem ou destino), cobrança ou item de pagamento de professor. Aulas materializadas sem nenhum desses vínculos **não** impedem mais: são apagadas junto com a turma. O evento do Google sai antes do delete, como hoje.

Fora disso, a janela orienta a encerrar a turma (comportamento atual).

### 6.2 Uma única aula

"Alunos da aula" = alunos com matrícula regular ativa cobrindo a data (`data_inicio <= data` e `data_fim` nula ou `>= data`), inclusive avulsos daquele dia, mais alunos com pendência de reposição `Agendada` cujo destino é esta aula.

Consulta antes de perguntar, no mesmo desenho de `ExcluirTurma`:

1. **Bloqueada** se a aula está 'Realizada', tem presença registrada, ou está ligada a cobrança ou pagamento de professor. Mensagem: a aula já aconteceu / já entrou no financeiro e não pode ser excluída.
2. **Sem alunos:** confirmação simples → status 'Excluída' → ressincroniza o Google.
3. **Com alunos sem presença:** a janela lista os alunos.
   - Aluno regular: o gestor escolhe a aula de reposição (mesma lista de destinos da tela de Reposições) ou "deixar pendente". Gera `pendencias_reposicao` com origem nesta aula, seguindo `planejarReposicao` (matrícula com `flag_reposicao` quando o destino é outra turma; nunca gera cobrança).
   - Aluno que repõe nesta aula: a pendência dele volta para 'Pendente' (e a matrícula de reposição criada só para isso é encerrada), ou o gestor já escolhe outro destino.
   - Ao confirmar, tudo em **uma transação** (função no banco chamada por RPC): reposições criadas/ajustadas e aula marcada 'Excluída'. Depois, ressincroniza o Google.
4. **Turma de aula única:** excluir a aula segue as mesmas regras; apagar o cadastro da turma segue 6.1.

Só a gestora exclui (`exigirGestora()` + RLS atual).

## 7. Interface

- **Formulário da turma** (`turmas/FormularioTurma.tsx`): campo "Repetição" com Não se repete · Diário (seg a sex) · Semanal · Quinzenal · Mensal · Personalizado.
  - Semanal/Quinzenal: botões de dia da semana existentes.
  - Mensal: texto "Todo dia 15" derivado de "Começa em".
  - Personalizado: "A cada [N] [dias | semanas | meses]"; dias da semana quando semanas.
  - Recorrentes: "Começa em" (obrigatório, padrão hoje) e "Termina em" (opcional, ajuda "Sem data, a turma vai até 31/12/AAAA").
  - Resumo ao vivo: "Toda terça e quinta, de 03/02 a 31/12/2026 — 78 aulas (5 datas puladas por feriado ou recesso)".
  - Não se repete: aviso de feriado/recesso com confirmação (4.3).
- **Lista de turmas:** a partir de 1º de dezembro, faixa "N turmas terminam em 31/12" com botão **Estender até dez/AAAA+1**, que move `data_fim` para 31/12 do ano seguinte nas turmas Ativas com `fim_automatico` e ressincroniza o Google. Turma com fim definido pelo gestor não entra.
- **Página da aula** (`agenda/aulas/[id]`): botão **Excluir esta aula** (gestora), com a janela de 6.2.
- **Validação** (`dominio/turmas/regras.ts`): mensagens para a gestora — sem data de início, fim antes do início, Semanal sem dia, intervalo < 1.

## 8. Testes

Vitest, funções puras, no padrão de `src/dominio/**.test.ts`:

- expansão da regra: cada frequência, intervalo, quinzenal ancorado na semana do início, mensal no dia 31, início passado e futuro, limite de `data_fim`;
- datas puladas: feriado, recesso só da escola da turma, turma sem escola, data única nunca pulada;
- `montarEvento`: RRULE por frequência, UNTIL no fuso, EXDATE incluindo excluídas e excluindo feriado com aula mantida;
- fim automático (31/12 do ano corrente) e renovação;
- regras de exclusão de turma (cada vínculo que bloqueia; aulas sem histórico não bloqueiam);
- regras de exclusão de aula (bloqueada, sem alunos, com alunos regulares, avulsos e de reposição) e o plano de reposições gerado;
- limpeza ao cadastrar feriado/recesso (o que é apagado e o que fica no alerta);
- reconhecimento da opção do formulário a partir da regra gravada.

## 9. Fora de escopo

- Horário diferente por dia ou por ocorrência.
- Mensal por posição ("2ª terça do mês").
- Renovação automática na virada do ano.
- Mover uma ocorrência para outra data (o caminho é excluir e usar reposição).
