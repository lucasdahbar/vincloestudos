# Ligar a integração com o Google Agenda

Roteiro para os itens **G1, G2 e G3** dos Ajustes aos Módulos Operacionais
(Rodada 2). São uns 20 minutos, feitos **uma vez só**.

## Antes de começar

**O projeto no Google Cloud tem que nascer dentro da conta Google da empresa**
(a do Workspace da Kelly), e não numa conta pessoal.

O motivo é prático, não burocrático: um projeto em conta pessoal só aceita tela
de consentimento **External**, e projeto External em modo *Testing* tem refresh
token que **expira a cada 7 dias**. A agenda pararia de sincronizar toda semana,
e alguém teria que reautorizar. Dentro do Workspace, a tela pode ser
**Internal** — sem verificação do Google e sem essa expiração.

Confirme antes: **a Kelly é administradora do Workspace?** Isso decide o
caminho abaixo, e é o mesmo pré-requisito do upgrade para Business Standard que
o item G3 (coorganizador do Meet) exige.

## Quem faz o quê

| Passo | Quem |
| --- | --- |
| Criar o projeto no Google Cloud, na conta do Workspace | dono da conta |
| Ativar a Google Calendar API | dono da conta |
| Tela de consentimento como **Internal** | dono da conta |
| Dar acesso de **Proprietário** ao dev, no IAM do projeto | dono da conta |
| Criar as agendas dos professores e copiar os IDs | dono da conta |
| Criar as credenciais OAuth (Client ID e Secret) | dev |
| Guardar o Secret nas variáveis de ambiente | dev |
| Clicar em **Permitir** para autorizar as agendas | dono da conta |

**O `CLIENT_SECRET` nunca vai por WhatsApp, e-mail ou print.** É por isso que o
dono da conta dá acesso ao projeto em vez de mandar a credencial: assim o dev
cria e lê o segredo direto no console, e ele não transita por lugar nenhum.

Se a organização bloquear a inclusão de uma conta de fora do domínio (política
de *domain restricted sharing*, ligada por padrão em organizações novas), há
duas saídas: criar um usuário para o dev dentro do Workspace, ou o dono criar a
credencial e mandar o **Client ID** normalmente e o **Secret** por um link de
uso único (onetimesecret.com e afins) — nunca no corpo da mensagem.

## Passo a passo

### 1. Projeto e API (juntos, na conta da empresa)

1. <https://console.cloud.google.com> — confirme, no canto superior, que a conta
   logada é a da empresa.
2. **Novo projeto**, nome `Mesinha Redonda`.
3. **APIs e serviços → Biblioteca** → procure *Google Calendar API* → **Ativar**.

### 2. Tela de consentimento

1. **APIs e serviços → Tela de permissão OAuth**.
2. Tipo de usuário: **Interno**. (Se essa opção estiver cinza, o projeto não
   está numa conta Workspace — volte ao passo 1.)
3. Nome do app: `Mesinha Redonda`. E-mail de suporte e de contato: o da empresa.
4. Escopos: adicione `https://www.googleapis.com/auth/calendar`.

   Esse escopo dá leitura **e** escrita. O sistema precisa dos dois: G2 pede que
   ele crie e atualize o evento da turma, não só leia.

### 3. Credenciais

1. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**.
2. Tipo: **Aplicativo da Web**.
3. **URIs de redirecionamento autorizados** — inclua os dois:
   - `http://localhost:3000/api/google/callback` (para desenvolvimento)
   - `https://SEU-DOMINIO/api/google/callback` (o endereço real do site)
4. Copie o **Client ID** e o **Client secret**.

### 4. Variáveis de ambiente

No `.env.local` (desenvolvimento) e no painel da hospedagem (produção):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_ATIVO=false
```

Deixe `GOOGLE_CALENDAR_ATIVO=false` por enquanto. Ele só vira `true` depois do
passo 5, quando houver token guardado — ligar antes só faz as turmas não
criarem evento (a página da turma mostra "ainda não tem evento na agenda").

A flag controla **apenas** a criação do evento na agenda do professor. As aulas
que aparecem na agenda do próprio sistema saem sempre da recorrência cadastrada
na turma, com a flag ligada ou desligada.

### 5. Autorização (a Kelly clica)

1. Com o site no ar, a Kelly abre **/cadastros/integracoes** (visível só para a
   gestora).
2. Clica em **Conectar o Google Agenda**.
3. Escolhe a conta da empresa e clica em **Permitir**.

O sistema guarda o *refresh token* no banco. É uma vez só: ele não expira
enquanto a autorização não for revogada.

### 6. Ligar

Troque para `GOOGLE_CALENDAR_ATIVO=true` e reinicie a aplicação.

### 7. Vincular cada professor à agenda dele (G1)

No Google Agenda, para cada agenda de professor:
**Configurações da agenda → Integrar agenda → ID da agenda** (algo como
`abc123@group.calendar.google.com`).

Cole esse ID no cadastro do professor, campo **Agenda do Google**.

Enquanto esse campo estiver vazio, a turma daquele professor não gera evento —
o sistema não tem onde criar.

## Meet da turma online (G3)

Turma **online** sem link ganha, ao ser salva, uma sala do Meet com:

- acesso **Confiável** — quem foi convidado entra direto, o resto pede para entrar;
- moderação ligada e o **professor como coorganizador** — é ele quem aceita os
  alunos da fila.

É a configuração que a gestora validou à mão em 25/09/2026. O link vai para o
campo **Link da videochamada**, para o evento da agenda e para o e-mail do
professor (G4). Se a gestora colar um link à mão, o sistema não mexe.

Pré-requisitos, feitos uma vez:

1. A conta que autoriza a integração precisa de **Business Standard** ou acima
   (o Starter não tem coorganizador). A sala pertence a essa conta.
2. **Google Meet REST API** ativada no projeto do Cloud (APIs e serviços →
   Biblioteca).
3. Reconectar em **/cadastros/integracoes** para autorizar o escopo
   `meetings.space.created`. A tela avisa enquanto isso faltar.

**Não apague a conta que autorizou a integração** sem antes reconectar com
outra: as salas já criadas pertencem a ela.

## Se algo der errado

| Sintoma | Causa provável |
| --- | --- |
| `redirect_uri_mismatch` | A URI do passo 3 não bate exatamente com a do site (atenção a `http`/`https` e à barra no fim). |
| Parou de sincronizar depois de uma semana | A tela de consentimento ficou **External** em modo Testing. Refaça o passo 2 como **Internal**. |
| `insufficient permission` ao criar o evento | O escopo ficou como `calendar.readonly`. Precisa ser `calendar`. |
| A turma não cria evento | O professor está sem **Agenda do Google** no cadastro (passo 7). |
