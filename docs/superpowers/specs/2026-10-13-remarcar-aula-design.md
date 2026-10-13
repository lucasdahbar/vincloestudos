# Remarcar uma aula — Documento de Design

**Data:** 13/10/2026 · **Pedido:** mensagem do tio de 13/10/2026. Decisões marcadas com **(decidido)** foram tomadas com aval de "decide".

## Regra

Uma aula específica de uma turma muda de dia e horário. Todo o resto segue com a turma: professor, sala do Meet, alunos matriculados. Não há reposição nem mudança de cobrança. O Google do professor acompanha.

## Decisões

- **(decidido)** Muda início e término; a janela já vem com a duração atual.
- **(decidido)** Só aula que ainda não aconteceu (sem presença, não Realizada, não Excluída). Pode remarcar de novo; "voltar ao horário original" desfaz.
- **(decidido)** Pode ir para outro mês: a cobrança continua no mês **original**.
- **(decidido)** Data nova em feriado ou recesso: só avisa, como na aula única.
- **(decidido)** Sem aviso automático aos responsáveis: o lembrete de aula já sai com a data nova.
- **(decidido)** Só aula **Agendada**: cancelada ou de feriado não é remarcada.
- **(decidido, revisto na revisão)** Turma de aula única: a aula é remarcada como qualquer outra, e a turma continua com a data original. Mudar a turma junto trocava a chave da aula — a reposição marcada nela (matrícula só na data original) caía da lista, e havia risco de aula duplicada. O evento do Google dela vai para o dia novo.
- Lembrete já na fila da aula remarcada é descartado e refeito com o dia novo; quem recebe são os alunos da data original.
- Encerrar a turma conta a aula remarcada pela data original e a marca como Excluída (o evento avulso sai). Excluir a turma apaga também os eventos avulsos.

## Modelo

- `aulas.data_hora_original` (timestamptz, nulo): o horário que a regra da turma deu à aula, preenchido quando ela é remarcada. A chave `google_calendar_event_id` continua a original, então a geração automática não recria a aula no dia de antes.
- `aulas.data_hora_referencia` (gerada: `coalesce(data_hora_original, data_hora_inicio)`): a data que vale para matrícula e cobrança.
- `aulas.google_evento_avulso_id`: o evento avulso da aula remarcada na agenda do professor.

## Onde a data original vale

- **Lista de alunos da aula:** quem está matriculado na data original — inclusive quem repõe naquele dia.
- **Cobrança:** o mês e a matrícula da data original.
- **Limpeza** (feriado novo, edição da turma): aula remarcada não é apagada.

A data nova vale para agenda, presença, link do professor e lembretes.

## Google

O dia original vira exceção (EXDATE) da série; a aula remarcada ganha um evento avulso, com o mesmo título, a mesma sala e os alunos daquele dia. Não se usa a edição de ocorrência do Google porque regravar a série (salvar a turma) pode desfazê-la. Desfazer a remarcação, excluir a aula ou encerrar a turma tira o evento avulso.
