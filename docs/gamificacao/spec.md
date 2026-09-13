# Gamificação — spec

Demanda: SPA-364.

## Problema

O hábito é o que o produto vende: retenção exige voltar amanhã, e depois de amanhã. Mas a
gamificação errada contradiz a tese — se premiar permanência, a tela "Perfil e Saúde Cognitiva",
que mede retenção em vez de consumo, vira mentira.

## Decisões

**XP vem de esforço de recuperação, nunca de tempo de tela.** A única fonte de XP é uma revisão
registrada: `hard` 20, `good` 15, `easy` 10, `again` 5. Não existe XP por abrir o app, por
sessão iniciada, por minuto de uso ou por sequência de logins. Acertar o que estava difícil
vale mais que acertar o fácil, porque é aí que a memória é reconstruída.

**O dia é materializado em `daily_progress`, não recalculado.** Cada revisão incrementa a linha
do dia (revisões, XP) **na mesma transação** que grava o log e o estado FSRS — é o que faz a
idempotência valer para os três ao mesmo tempo: revisão reenviada não entra no log, logo não
entra no XP nem na contagem.

**Cada dia guarda a meta que valia nele** (`daily_progress.goal`) e se ela foi cumprida
(`met_goal`). É isso que garante o aceite "reduzir a meta não quebra o streak": o passado não é
reinterpretado com a meta de hoje. A alternativa — derivar o streak comparando a meta atual com
o histórico — faria aumentar a meta apagar streaks já conquistados, o que é punição retroativa.

**Streak é sequência de dias com a meta cumprida**, contada a partir de hoje ou de ontem. Não
quebra por consultar antes de estudar: o dia corrente só conta quando a meta é atingida, e o
dia anterior sustenta a sequência até a virada.

**A virada do dia e da semana usa o fuso do aluno**, não UTC. Uma revisão às 23h de Brasília
pertence ao dia de Brasília. A semana começa na segunda.

**A liga é apurada na leitura, não por cron.** Ao consultar o ranking, se `settled_week` é
anterior à semana corrente, a apuração roda uma vez e grava: os 3 primeiros sobem, os 3 últimos
descem, e ligas pequenas demais não promovem nem rebaixam. Sem agendador, sem processo extra
para o deploy do Railway manter de pé, e o resultado é o mesmo para quem consultar primeiro.

**XP da liga é o da semana, calculado de `daily_progress`**, não um placar separado. Um placar
paralelo divergiria do histórico no primeiro bug.

**`badges` volta vazio**: não existe sistema de conquista no backend. Lista vazia é fato;
badge inventada seria interface que mente.

**`retentionPercent`** é a média de `stability/21` limitada a 1 — a proporção do horizonte de
três semanas que a memória do aluno já sustenta. Aluno sem histórico recebe 0, não uma média
fictícia.

## Consequência para o app

`rankingSchema.podium` é `.length(3)` no `desfeed-app`; a API devolve **até** 3, porque liga com
menos de três alunos existe no primeiro dia de uso. O app precisa de `.max(3)`.

## Fora de escopo

Duelos de verdade (o campo `duel` descreve a regra da promoção, não uma feature de duelo),
badges e notificação do lembrete.
