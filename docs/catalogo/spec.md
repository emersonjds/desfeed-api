# Catálogo e curadoria — spec

Demanda: SPA-363.

## Problema

O risco mais concreto do produto é card gerado por IA que está errado: ensinar errado é pior
que não ensinar. A curadoria é a resposta, e ela só existe se couber em um toque — 54% das
escolas não treinam professor em tecnologia, e curadoria que exige formulário não acontece.

## Decisões

**Card e conteúdo são tabelas separadas.** `cards` guarda identidade, status e curadoria;
`card_versions` guarda o conteúdo (pergunta, termo, quatro alternativas, gabarito, imagem).
Editar um card **insere uma versão** e move `current_version`; nada é sobrescrito. É o que
permite o histórico de revisão de quem já respondeu continuar apontando para o texto que a
pessoa viu — requisito explícito do aceite. A alternativa (UPDATE no card) corrompe o histórico
silenciosamente, e o estrago só aparece semanas depois, no relatório.

**Decisão em uma requisição**: `POST /api/cards/:cardId/decision` com `{"decision":"approved"}`
ou `"rejected"`. Sem rascunho, sem formulário, sem passo intermediário. É idempotente: decidir
duas vezes o mesmo valor não muda mais nada.

**Quatro status, não dois.** `pending` (a IA gerou, ninguém olhou), `approved` (na fila do
aluno), `rejected` (fora para sempre) e `under_review` (suspenso por report). A fila do aluno
lê **só `approved`** — é assim que um card rejeitado sai da fila de todos ao mesmo tempo, sem
varrer estado de aluno.

**Report de erro factual suspende, não apaga.** Um aluno reportando `factualmente-errado` move
o card aprovado para `under_review`, o que o tira da fila de todo mundo na hora e o devolve
para a fila do professor. As alternativas eram rejeitar direto — que entrega a qualquer aluno o
poder de destruir conteúdo da turma — ou só registrar e esperar, que deixa o erro circulando
enquanto ninguém olha. Suspender é reversível e imediato.

**O report é gravado na versão que o aluno viu.** `card_reports.version` congela isso. Sem ele,
o eval de qualidade da geração credita o defeito ao texto errado depois de uma edição.

**Um report por aluno por card** (índice único). O segundo devolve 409. Sem isso, um aluno
sozinho inflaciona a estatística que alimenta o eval.

**Professor tem identidade própria** (`teachers`, header `x-teacher-id`). Quem decidiu e quando
ficam em `reviewed_by`/`reviewed_at`. Curadoria sem autoria não é auditável, e é ela que
responde a pergunta do júri sobre alucinação.

**Card criado pelo professor nasce `approved`** e com `source: 'teacher'`. Quem escreveu já
curou; exigir que ele aprove o próprio card é cerimônia.

## Fora de escopo

Quem gera o card (SPA-358), quando ele volta para o aluno (SPA-359) e o relatório do eval de
qualidade a partir de `card_reports`.
