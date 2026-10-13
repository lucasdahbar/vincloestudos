# Encerrar turma — Documento de Design

**Data:** 13/10/2026 · **Pedido:** mensagem do tio de 13/10/2026 (o sistema manda "encerrar" a turma que não pode ser excluída, mas não havia botão para isso).

Decisões marcadas com **(decidido)** foram tomadas pelo Lucas/Claude com aval de "decide e muda depois se precisar".

## Regra

A gestora informa a **data de encerramento**: o primeiro dia **sem** aula. A turma termina na véspera; as aulas até a véspera continuam valendo.

1. Sem aluno matriculado: encerra.
2. Com alunos: confere as aulas da turma a partir da data, inclusive.
   - Nenhuma cobrada: desmatricula os alunos a partir da data e encerra.
   - Cobradas só em **rascunho**: o próprio encerramento tira essas aulas do rascunho e recalcula o total; depois desmatricula e encerra. (Gerar a cobrança de novo **não** retira aula de rascunho — só acrescenta —, por isso o encerramento faz isso.)
   - Cobradas em cobrança **confirmada** (Confirmada, Enviada, Parcial, Quitada): bloqueia e lista aluno e data. Libera quando cada aluno cobrado naquela aula tiver uma pendência de reposição com origem nela — por "avisou que não vem" ou por "Excluir esta aula", que transfere todos de uma vez. A aula segue cobrada e a reposição sai a R$ 0,00 (regra da Rodada 3).

## Bloqueios adicionais (decidido)

- **Aula já dada a partir da data** (presença registrada ou status Realizada): bloqueia e informa a primeira data possível (dia seguinte à última aula dada).
- **Aluno de outra turma com reposição marcada** numa aula a partir da data: bloqueia e pede para remarcar antes.
- **Data no primeiro dia da turma ou antes**: bloqueia; a turma não teria aula nenhuma — o caminho é excluir (ou desmatricular e excluir).
- **Data depois do dia seguinte ao fim atual**: bloqueia, porque estenderia a turma (ano digitado errado, por exemplo). O dia seguinte ao fim vale.
- **Encerramento com data futura não vira "Encerrada" sozinho** (não há rotina agendada): a turma segue Ativa com o fim na véspera. Quando o fim passa, a janela já sugere o dia seguinte a ele, e encerrar de novo fecha a turma e as matrículas.

## Efeitos (decidido)

- **Recorrente:** `data_fim` = véspera, `fim_automatico` = false (sai da renovação de fim de ano). Status vira **Encerrada** se a data é hoje ou passou; se é futura, a turma segue Ativa até lá e mostra "De … a <véspera>".
- **Aula única:** não pergunta data. Se a aula ainda não aconteceu, a data é a da aula (ela sai); se já aconteceu, nada muda além do status. Status vira Encerrada.
- **Matrículas ativas da turma:** a que começa na data ou depois é apagada; as demais terminam na véspera e, se a data já chegou, ficam Encerradas (como no "desmatricular").
- **Aulas a partir da data:** sem nenhum vínculo, são apagadas; com vínculo (pendência, cobrança confirmada), viram **Excluída** — a linha segura a reposição e a cobrança.
- **Google:** a turma recorrente encerrada mantém o evento, terminando na véspera — as aulas passadas ficam na agenda do professor. (Antes, encerrar apagava o evento inteiro.) Aula única que não aconteceu: o evento sai.
- Tudo numa transação no banco (função `encerrar_turma`), que confere de novo os bloqueios.
